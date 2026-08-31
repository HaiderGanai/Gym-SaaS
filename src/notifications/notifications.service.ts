import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { NotificationLog, DeliveryStatus } from '../communication/entities/notification-log.entity';
import { Member } from '../members/entities/member.entity';
import { MemberGymAccess } from '../members/entities/member-gym-access.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';
import { SlotStatus } from '../schedule/entities/slot.entity';
import { Gym } from '../gym/entities/gym.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { MailService } from '../communication/mail.service';
import { FirebaseService } from './firebase.service';
import { WebPushService, WebPushSubscription } from './web-push.service';
import { assertGymAccess } from '../common/utils/gym-scope';
import type { MemberJwtPayload, StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';
import { BroadcastDto } from './dto/broadcast.dto';
import { RegisterWebPushSubscriptionDto } from './dto/register-web-push-subscription.dto';

// how long before a class starts to send the reminder
// ponytail: single fixed lead time — per-gym config if that's ever requested
const BOOKING_REMINDER_HOURS = 2;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationLog) private logRepo: Repository<NotificationLog>,
    @InjectRepository(Member) private memberRepo: Repository<Member>,
    @InjectRepository(MemberGymAccess) private accessRepo: Repository<MemberGymAccess>,
    @InjectRepository(Booking) private bookingRepo: Repository<Booking>,
    @InjectRepository(Gym) private gymRepo: Repository<Gym>,
    private mailService: MailService,
    private firebase: FirebaseService,
    private webPush: WebPushService,
  ) {}

  // Both push channels are best-effort and independent of each other — a
  // member can have a mobile FCM token, a browser web-push subscription,
  // both, or neither. One NotificationLog row still gets one push_status:
  // sent if either channel delivered, failed if at least one was attempted
  // and none delivered, skipped if the member has no device registered at all.
  private async dispatchPush(
    member: Member, title: string, body: string, data?: Record<string, unknown>, icon?: string,
  ): Promise<DeliveryStatus> {
    let attempted = false;
    let sent = false;

    if (member.fcm_token) {
      attempted = true;
      const result = await this.firebase.send(member.fcm_token, title, body, data, icon);
      if (result === 'sent') sent = true;
      if (result === 'token_invalid') await this.memberRepo.update(member.id, { fcm_token: () => 'NULL' });
    }

    if (member.web_push_subscription) {
      attempted = true;
      const result = await this.webPush.send(
        member.web_push_subscription as unknown as WebPushSubscription, title, body, data, icon,
      );
      if (result === 'sent') sent = true;
      if (result === 'subscription_invalid') {
        await this.memberRepo.update(member.id, { web_push_subscription: () => 'NULL' });
      }
    }

    if (!attempted) return DeliveryStatus.SKIPPED;
    return sent ? DeliveryStatus.SENT : DeliveryStatus.FAILED;
  }

  // Gym name + org logo for push branding — looked up here (not passed in by
  // every caller) so every notify()/logDelivered() call gets it for free, the
  // same reason the member itself is re-fetched here rather than threaded
  // through every trigger signature. Organization.logo_url is the only logo
  // this schema has (gyms don't carry their own) — every branch of an org
  // shows the org's logo until a per-gym logo field is asked for.
  private async gymBranding(gymId: string): Promise<{ name: string; icon?: string }> {
    const gym = await this.gymRepo.findOne({ where: { id: gymId }, relations: { organization: true } });
    return { name: gym?.name ?? '', icon: gym?.organization?.logo_url ?? undefined };
  }

  // ── Core dispatch — every member-facing event goes through here ─────────
  // Looks the member up itself (for the fcm_token + email), so callers only
  // need a member_id, not a preloaded relation. Email and push are each
  // independently best-effort: one channel failing never blocks the other,
  // and the log row is written regardless so the member's feed always shows it.
  private async notify(params: {
    memberId: string;
    gymId: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    email?: (member: Member) => Promise<void>;
  }): Promise<void> {
    const member = await this.memberRepo.findOneByOrFail({ id: params.memberId });
    const branding = await this.gymBranding(params.gymId);
    const log = this.logRepo.create({
      gym_id: params.gymId,
      member_id: params.memberId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data ?? null,
    });

    if (params.email) {
      try {
        await params.email(member);
        log.email_status = DeliveryStatus.SENT;
      } catch (err) {
        this.logger.error(`Email notification failed (${params.type}) for member ${member.id}`, err as Error);
        log.email_status = DeliveryStatus.FAILED;
      }
    }

    // gym_name/gym_icon_url ride along in the push payload only — the stored
    // log.data stays undecorated since GET /notifications joins gym.organization
    // for display instead of duplicating it into stored jsonb
    const pushData = { ...(params.data ?? {}), gym_name: branding.name, ...(branding.icon ? { gym_icon_url: branding.icon } : {}) };
    log.push_status = await this.dispatchPush(member, params.title, params.body, pushData, branding.icon);

    await this.logRepo.save(log);
  }

  // Records a notification whose email was already sent by the caller (e.g.
  // InvoicesService.resend, which must be able to throw on email failure —
  // that's the opposite of notify()'s best-effort contract). Push + log only.
  private async logDelivered(params: {
    memberId: string; gymId: string; type: string; title: string; body: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const member = await this.memberRepo.findOneByOrFail({ id: params.memberId });
    const branding = await this.gymBranding(params.gymId);
    const log = this.logRepo.create({
      gym_id: params.gymId, member_id: params.memberId, type: params.type,
      title: params.title, body: params.body, data: params.data ?? null,
      email_status: DeliveryStatus.SENT,
    });
    const pushData = { ...(params.data ?? {}), gym_name: branding.name, ...(branding.icon ? { gym_icon_url: branding.icon } : {}) };
    log.push_status = await this.dispatchPush(member, params.title, params.body, pushData, branding.icon);
    await this.logRepo.save(log);
  }

  async logInvoiceResent(memberId: string, gym: Gym, invoice: Invoice): Promise<void> {
    await this.logDelivered({
      memberId, gymId: gym.id,
      type: 'invoice_ready',
      title: 'Invoice ready',
      body: `Your invoice ${invoice.invoice_number} for ${invoice.currency} ${Number(invoice.amount).toFixed(2)} is ready.`,
      data: { invoice_id: invoice.id },
    });
  }

  // ── Typed triggers — one per event the rest of the app fires ────────────

  async notifyWaitlistPromoted(
    memberId: string, gymId: string, gymName: string, activityName: string, startsAt: Date,
  ): Promise<void> {
    await this.notify({
      memberId, gymId,
      type: 'waitlist_promoted',
      title: "You're in!",
      body: `A spot opened up in ${activityName} — you're now confirmed.`,
      data: { activity_name: activityName, starts_at: startsAt.toISOString() },
      email: (m) => this.mailService.sendWaitlistPromoted(m.email, m.full_name, activityName, startsAt, gymName),
    });
  }

  async notifySlotDisabled(
    memberId: string, gymId: string, gymName: string, activityName: string, startsAt: Date,
  ): Promise<void> {
    await this.notify({
      memberId, gymId,
      type: 'slot_disabled',
      title: 'Class cancelled',
      body: `${activityName} on ${startsAt.toDateString()} was cancelled.`,
      data: { activity_name: activityName, starts_at: startsAt.toISOString() },
      email: (m) => this.mailService.sendSlotDisabled(m.email, m.full_name, activityName, startsAt, gymName),
    });
  }

  async notifyInvoiceReady(memberId: string, gym: Gym, invoice: Invoice): Promise<void> {
    await this.notify({
      memberId, gymId: gym.id,
      type: 'invoice_ready',
      title: 'Invoice ready',
      body: `Your invoice ${invoice.invoice_number} for ${invoice.currency} ${Number(invoice.amount).toFixed(2)} is ready.`,
      data: { invoice_id: invoice.id },
      email: (m) => this.mailService.sendInvoiceEmail(m.email, m.full_name, invoice, gym.name),
    });
  }

  // Booking confirmed/waitlisted/cancelled-by-staff and subscription
  // past_due/paused/resumed have no email template today — push + in-app
  // log only (no `email` callback). Add a MailService method + pass it in
  // here if/when these need an email leg too; the log row already tracks
  // email_status = skipped in the meantime, same as any event without one.

  async notifyBookingConfirmed(
    memberId: string, gymId: string, activityName: string, startsAt: Date, bookingId: string, slotId: string,
  ): Promise<void> {
    await this.notify({
      memberId, gymId,
      type: 'booking_confirmed',
      title: 'Booking confirmed',
      body: `You're confirmed for ${activityName} at ${startsAt.toISOString()}.`,
      data: { booking_id: bookingId, slot_id: slotId, activity_name: activityName, starts_at: startsAt.toISOString() },
    });
  }

  async notifyBookingWaitlisted(
    memberId: string, gymId: string, activityName: string, startsAt: Date,
    bookingId: string, slotId: string, position: number,
  ): Promise<void> {
    await this.notify({
      memberId, gymId,
      type: 'booking_waitlisted',
      title: "You're on the waitlist",
      body: `${activityName} is full — you're #${position} on the waitlist.`,
      data: {
        booking_id: bookingId, slot_id: slotId, activity_name: activityName,
        starts_at: startsAt.toISOString(), waitlist_position: position,
      },
    });
  }

  async notifyBookingCancelled(
    memberId: string, gymId: string, activityName: string, startsAt: Date, cancelledBy: 'member' | 'staff',
  ): Promise<void> {
    await this.notify({
      memberId, gymId,
      type: 'booking_cancelled',
      title: 'Booking cancelled',
      body: cancelledBy === 'staff'
        ? `Your booking for ${activityName} on ${startsAt.toDateString()} was cancelled by the gym.`
        : `Your booking for ${activityName} on ${startsAt.toDateString()} was cancelled.`,
      data: { activity_name: activityName, starts_at: startsAt.toISOString(), cancelled_by: cancelledBy },
    });
  }

  async notifySubscriptionPastDue(memberId: string, gymId: string, planName: string): Promise<void> {
    await this.notify({
      memberId, gymId,
      type: 'subscription_past_due',
      title: 'Membership past due',
      body: `Your ${planName} membership has lapsed — renew at the front desk to keep booking classes.`,
      data: { plan_name: planName },
    });
  }

  async notifySubscriptionPaused(memberId: string, gymId: string, planName: string): Promise<void> {
    await this.notify({
      memberId, gymId,
      type: 'subscription_paused',
      title: 'Membership paused',
      body: `Your ${planName} membership has been paused.`,
      data: { plan_name: planName },
    });
  }

  async notifySubscriptionResumed(memberId: string, gymId: string, planName: string): Promise<void> {
    await this.notify({
      memberId, gymId,
      type: 'subscription_resumed',
      title: 'Membership resumed',
      body: `Your ${planName} membership is active again.`,
      data: { plan_name: planName },
    });
  }

  // ── Automated booking reminders — the one currently-missing MVP feature ─

  @Cron('*/15 * * * *')
  async sendBookingReminders(): Promise<void> {
    const cutoff = new Date(Date.now() + BOOKING_REMINDER_HOURS * 3600_000);
    const bookings = await this.bookingRepo.createQueryBuilder('b')
      .innerJoinAndSelect('b.slot', 's')
      .innerJoinAndSelect('s.gym', 'g')
      .where('b.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('b.reminder_sent_at IS NULL')
      .andWhere('s.status = :slotStatus', { slotStatus: SlotStatus.ENABLED })
      .andWhere('s.starts_at <= :cutoff AND s.starts_at > :now', { cutoff, now: new Date() })
      .getMany();

    for (const booking of bookings) {
      await this.notify({
        memberId: booking.member_id,
        gymId: booking.slot.gym_id,
        type: 'booking_reminder',
        title: 'Upcoming class',
        body: `${booking.slot.activity_name} starts at ${booking.slot.starts_at.toISOString()} — see you there!`,
        data: { booking_id: booking.id, slot_id: booking.slot.id },
        email: (m) => this.mailService.sendBookingReminder(
          m.email, m.full_name, booking.slot.activity_name, booking.slot.starts_at, booking.slot.gym.name,
        ),
      }).catch((err) => this.logger.error(`Reminder failed for booking ${booking.id}`, err as Error));
      await this.bookingRepo.update(booking.id, { reminder_sent_at: new Date() });
    }
    if (bookings.length) this.logger.log(`Sent ${bookings.length} booking reminder(s)`);
  }

  // ── Staff: announcement broadcast (In-App Email Composer / Push Manager) ─

  async broadcastAnnouncement(user: StaffJwtPayload, dto: BroadcastDto) {
    const gym = await assertGymAccess(dto.gym_id, user, this.gymRepo);

    const access = await this.accessRepo.find({
      where: { gym_id: gym.id, is_active: true },
      select: { member_id: true },
    });
    const gymMemberIds = access.map((a) => a.member_id);
    const memberIds = dto.member_ids?.length
      ? gymMemberIds.filter((id) => dto.member_ids!.includes(id))
      : gymMemberIds;

    const results = await Promise.allSettled(
      memberIds.map((memberId) => this.notify({
        memberId, gymId: gym.id,
        type: 'announcement',
        title: dto.title,
        body: dto.body,
        email: (m) => this.mailService.sendAnnouncement(m.email, m.full_name, gym.name, dto.title, dto.body),
      })),
    );
    const notified = results.filter((r) => r.status === 'fulfilled').length;
    return { message: 'Announcement sent', targeted: memberIds.length, notified };
  }

  // ── Member: in-app notification inbox ────────────────────────────────────

  // gym relation carries name + org logo for display — no need to duplicate
  // either into the stored log.data, this is a live join, never stale
  private shapeNotification(log: NotificationLog) {
    const { gym, ...rest } = log;
    return { ...rest, gym_name: gym?.name ?? null, gym_icon_url: gym?.organization?.logo_url ?? null };
  }

  async listForMember(user: MemberJwtPayload, unreadOnly: boolean) {
    const logs = await this.logRepo.find({
      where: { member_id: user.sub, ...(unreadOnly ? { is_read: false } : {}) },
      order: { created_at: 'DESC' },
      relations: { gym: { organization: true } },
    });
    return logs.map((log) => this.shapeNotification(log));
  }

  async unreadCount(user: MemberJwtPayload) {
    const unread_count = await this.logRepo.count({ where: { member_id: user.sub, is_read: false } });
    return { unread_count };
  }

  async markRead(id: string, user: MemberJwtPayload) {
    const log = await this.logRepo.findOne({
      where: { id, member_id: user.sub },
      relations: { gym: { organization: true } },
    });
    if (!log) throw new NotFoundException('Notification not found');
    if (!log.is_read) {
      log.is_read = true;
      log.read_at = new Date();
      await this.logRepo.save(log);
    }
    return this.shapeNotification(log);
  }

  async markAllRead(user: MemberJwtPayload) {
    const result = await this.logRepo.update(
      { member_id: user.sub, is_read: false },
      { is_read: true, read_at: new Date() },
    );
    return { marked_read: result.affected ?? 0 };
  }

  // ── Member: device token (required before push can ever be delivered) ───

  async registerDeviceToken(user: MemberJwtPayload, token: string) {
    await this.memberRepo.update(user.sub, { fcm_token: token });
    return { message: 'Device token registered' };
  }

  async clearDeviceToken(user: MemberJwtPayload) {
    await this.memberRepo.update(user.sub, { fcm_token: () => 'NULL' });
    return { message: 'Device token cleared' };
  }

  // ── Member: browser web-push subscription (mirrors the FCM device token) ─

  async registerWebPushSubscription(user: MemberJwtPayload, dto: RegisterWebPushSubscriptionDto) {
    const subscription = { endpoint: dto.endpoint, keys: dto.keys };
    await this.memberRepo.update(user.sub, { web_push_subscription: subscription });
    return { message: 'Web push subscription registered' };
  }

  async clearWebPushSubscription(user: MemberJwtPayload) {
    await this.memberRepo.update(user.sub, { web_push_subscription: () => 'NULL' });
    return { message: 'Web push subscription cleared' };
  }

  // ── Member: manual test push — verifies wiring (VAPID keys, subscription
  // validity, FCM token validity) without needing to trigger a real event ──

  async sendTestPush(user: MemberJwtPayload, title?: string, body?: string, gymId?: string) {
    const member = await this.memberRepo.findOneByOrFail({ id: user.sub });
    if (!member.fcm_token && !member.web_push_subscription) {
      throw new NotFoundException(
        'No device registered — call POST /notifications/device-token (mobile) or '
        + 'POST /notifications/web-push-subscription (browser) first',
      );
    }
    // gym_id is optional — pass it to also exercise gym-branded icon/badge
    // (the same path real notify() triggers use) instead of the generic test
    if (gymId && !user.gym_ids.includes(gymId)) {
      throw new ForbiddenException('Not affiliated with this gym');
    }
    const branding = gymId ? await this.gymBranding(gymId) : { name: '', icon: undefined as string | undefined };
    const data = { type: 'test', ...(gymId ? { gym_name: branding.name, ...(branding.icon ? { gym_icon_url: branding.icon } : {}) } : {}) };
    const push_status = await this.dispatchPush(
      member,
      title ?? 'Test notification',
      body ?? 'If you can see this, push is wired up correctly.',
      data,
      branding.icon,
    );
    return {
      push_status,
      channels_attempted: {
        fcm: !!member.fcm_token,
        web_push: !!member.web_push_subscription,
      },
      ...(gymId ? { gym_name: branding.name, gym_icon_url: branding.icon ?? null } : {}),
    };
  }
}
