import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { assertGymAccess } from '../common/utils/gym-scope';
import type { MemberJwtPayload, StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';
import { BroadcastDto } from './dto/broadcast.dto';

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
  ) {}

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

    if (member.fcm_token) {
      const result = await this.firebase.send(member.fcm_token, params.title, params.body, params.data);
      log.push_status = result === 'sent' ? DeliveryStatus.SENT : DeliveryStatus.FAILED;
      if (result === 'token_invalid') {
        await this.memberRepo.update(member.id, { fcm_token: null });
      }
    }

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
    const log = this.logRepo.create({
      gym_id: params.gymId, member_id: params.memberId, type: params.type,
      title: params.title, body: params.body, data: params.data ?? null,
      email_status: DeliveryStatus.SENT,
    });
    if (member.fcm_token) {
      const result = await this.firebase.send(member.fcm_token, params.title, params.body, params.data);
      log.push_status = result === 'sent' ? DeliveryStatus.SENT : DeliveryStatus.FAILED;
      if (result === 'token_invalid') await this.memberRepo.update(member.id, { fcm_token: null });
    }
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

  listForMember(user: MemberJwtPayload, unreadOnly: boolean) {
    return this.logRepo.find({
      where: { member_id: user.sub, ...(unreadOnly ? { is_read: false } : {}) },
      order: { created_at: 'DESC' },
    });
  }

  async unreadCount(user: MemberJwtPayload) {
    const unread_count = await this.logRepo.count({ where: { member_id: user.sub, is_read: false } });
    return { unread_count };
  }

  async markRead(id: string, user: MemberJwtPayload) {
    const log = await this.logRepo.findOne({ where: { id, member_id: user.sub } });
    if (!log) throw new NotFoundException('Notification not found');
    if (!log.is_read) {
      log.is_read = true;
      log.read_at = new Date();
      await this.logRepo.save(log);
    }
    return log;
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
    await this.memberRepo.update(user.sub, { fcm_token: null });
    return { message: 'Device token cleared' };
  }
}
