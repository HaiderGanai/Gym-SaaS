import {
  Injectable, NotFoundException, ForbiddenException,
  ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Booking, BookingStatus } from './entities/booking.entity';
import { Slot, SlotStatus } from '../schedule/entities/slot.entity';
import { MemberSubscription, SubscriptionStatus } from '../subscriptions/entities/member-subscription.entity';
import { PlanType } from '../plans/entities/membership-plan.entity';
import { Member, MemberStatus } from '../members/entities/member.entity';
import { Gym } from '../gym/entities/gym.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { scopedGymIds, assertGymAccess } from '../common/utils/gym-scope';
import type { StaffJwtPayload, MemberJwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private bookingRepo: Repository<Booking>,
    @InjectRepository(Slot) private slotRepo: Repository<Slot>,
    @InjectRepository(MemberSubscription) private subRepo: Repository<MemberSubscription>,
    @InjectRepository(Member) private memberRepo: Repository<Member>,
    @InjectRepository(Gym) private gymRepo: Repository<Gym>,
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
  ) {}

  // ── Member: book a slot ──────────────────────────────────────────────────

  async book(dto: CreateBookingDto, user: MemberJwtPayload) {
    if (user.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException(`Your membership is ${user.status} — visit the front desk`);
    }
    const slot = await this.slotRepo.findOne({ where: { id: dto.slot_id } });
    // disabled slots are invisible to members, same as browse
    if (!slot || slot.status !== SlotStatus.ENABLED) throw new NotFoundException('Slot not found');
    if (!user.gym_ids.includes(slot.gym_id)) throw new ForbiddenException('Access denied');

    const now = new Date();
    if (slot.starts_at <= now) throw new BadRequestException('Class has already started');
    const opensAt = new Date(slot.starts_at.getTime() - slot.booking_window_hours * 3600_000);
    if (now < opensAt) {
      throw new BadRequestException(`Booking opens at ${opensAt.toISOString()}`);
    }

    const sub = await this.activeSubscription(user.sub, slot.gym_id);
    if (!sub) {
      throw new ForbiddenException('An active subscription at this gym is required to book classes');
    }
    await this.assertCreditsLeft(sub, user.sub, slot.gym_id);

    const duplicate = await this.bookingRepo.findOne({
      where: { slot_id: slot.id, member_id: user.sub, status: Not(BookingStatus.CANCELLED) },
    });
    if (duplicate) throw new ConflictException('You already have a booking for this class');

    const overlap = await this.bookingRepo.createQueryBuilder('b')
      .innerJoinAndSelect('b.slot', 's')
      .where('b.member_id = :memberId', { memberId: user.sub })
      .andWhere('b.status IN (:...statuses)', {
        statuses: [BookingStatus.CONFIRMED, BookingStatus.WAITLISTED],
      })
      .andWhere('s.starts_at < :ends AND s.ends_at > :starts', {
        starts: slot.starts_at, ends: slot.ends_at,
      })
      .getOne();
    if (overlap) {
      throw new ConflictException(
        `Overlaps your "${overlap.slot.activity_name}" booking at ${overlap.slot.starts_at.toISOString()}`,
      );
    }

    // race-safe capacity claim: only succeeds while booking_count < capacity
    const claimed = await this.slotRepo.createQueryBuilder()
      .update()
      .set({ booking_count: () => 'booking_count + 1' })
      .where('id = :id AND booking_count < capacity', { id: slot.id })
      .execute();

    if (claimed.affected === 1) {
      let booking = await this.bookingRepo.save(this.bookingRepo.create({
        slot_id: slot.id, member_id: user.sub, status: BookingStatus.CONFIRMED,
      }));
      booking.qr_token = this.bookingQr(booking, slot);
      booking = await this.bookingRepo.save(booking);
      return { message: 'Booking confirmed', booking: { ...booking, slot } };
    }

    // class full → waitlist (no QR until promoted)
    // ponytail: position from a count — two simultaneous waitlist joins could tie;
    // promotion falls back to created_at order so nobody gets lost
    const position = (await this.bookingRepo.count({
      where: { slot_id: slot.id, status: BookingStatus.WAITLISTED },
    })) + 1;
    const booking = await this.bookingRepo.save(this.bookingRepo.create({
      slot_id: slot.id, member_id: user.sub,
      status: BookingStatus.WAITLISTED, waitlist_position: position,
    }));
    return {
      message: `Class is full — you are on the waitlist (position ${position})`,
      booking: { ...booking, slot },
    };
  }

  // ── Member: my bookings ──────────────────────────────────────────────────

  async myBookings(user: MemberJwtPayload, includePast = false) {
    return this.bookingRepo.find({
      where: {
        member_id: user.sub,
        ...(includePast ? {} : {
          status: Not(BookingStatus.CANCELLED),
          slot: { ends_at: MoreThan(new Date()) },
        }),
      },
      relations: { slot: true },
      order: { slot: { starts_at: 'ASC' } },
    });
  }

  // ── Cancel (member respects the cutoff, staff does not) ─────────────────

  async cancelOwn(id: string, user: MemberJwtPayload) {
    const booking = await this.bookingRepo.findOne({
      where: { id, member_id: user.sub },
      relations: { slot: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.cancel(booking, true);
  }

  async staffCancel(id: string, user: StaffJwtPayload) {
    const booking = await this.bookingRepo.findOne({ where: { id }, relations: { slot: true } });
    if (!booking) throw new NotFoundException('Booking not found');
    await assertGymAccess(booking.slot.gym_id, user, this.gymRepo);
    return this.cancel(booking, false);
  }

  private async cancel(booking: Booking, enforceCutoff: boolean) {
    if (booking.status === BookingStatus.CANCELLED) {
      throw new ConflictException('Booking is already cancelled');
    }
    if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.WAITLISTED) {
      throw new ConflictException(`Cannot cancel a ${booking.status} booking`);
    }
    const slot = booking.slot;
    if (enforceCutoff && booking.status === BookingStatus.CONFIRMED) {
      const cutoff = new Date(slot.starts_at.getTime() - slot.cancellation_cutoff_hours * 3600_000);
      if (new Date() > cutoff) {
        throw new ForbiddenException(
          `Cancellation closed ${slot.cancellation_cutoff_hours}h before class — ask the front desk`,
        );
      }
    }

    const wasConfirmed = booking.status === BookingStatus.CONFIRMED;
    booking.status = BookingStatus.CANCELLED;
    booking.cancelled_at = new Date();
    await this.bookingRepo.save(booking);

    // a confirmed cancellation frees a spot: promote the waitlist, else release the count
    let promoted: Booking | null = null;
    if (wasConfirmed) {
      if (slot.status === SlotStatus.ENABLED && slot.starts_at > new Date()) {
        promoted = await this.bookingRepo.findOne({
          where: { slot_id: slot.id, status: BookingStatus.WAITLISTED },
          relations: { member: true },
          order: { waitlist_position: 'ASC', created_at: 'ASC' },
        });
      }
      if (promoted) {
        promoted.status = BookingStatus.CONFIRMED;
        promoted.waitlist_position = null;
        promoted.qr_token = this.bookingQr(promoted, slot);
        await this.bookingRepo.save(promoted);
        // best-effort — a dead mailbox/push must not undo the promotion
        const gym = await this.gymRepo.findOneByOrFail({ id: slot.gym_id });
        await this.notificationsService
          .notifyWaitlistPromoted(promoted.member_id, gym.id, gym.name, slot.activity_name, slot.starts_at)
          .catch(() => undefined);
      } else {
        await this.slotRepo.createQueryBuilder()
          .update()
          .set({ booking_count: () => 'GREATEST(booking_count - 1, 0)' })
          .where('id = :id', { id: slot.id })
          .execute();
      }
    }
    return {
      message: 'Booking cancelled',
      promoted_from_waitlist: promoted
        ? { booking_id: promoted.id, member: promoted.member.full_name }
        : null,
    };
  }

  // ── Staff: list + no-show ────────────────────────────────────────────────

  async list(
    user: StaffJwtPayload,
    filters: { gym_id?: string; slot_id?: string; member_id?: string; status?: BookingStatus },
  ) {
    const scope = await scopedGymIds(user, this.gymRepo);
    if (filters.gym_id && scope && !scope.includes(filters.gym_id)) {
      throw new ForbiddenException('Access denied');
    }
    const gymIds = filters.gym_id ? [filters.gym_id] : scope;
    return this.bookingRepo.find({
      where: {
        ...(filters.slot_id ? { slot_id: filters.slot_id } : {}),
        ...(filters.member_id ? { member_id: filters.member_id } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        slot: gymIds ? { gym_id: In(gymIds) } : {},
      },
      relations: { slot: true, member: true },
      select: {
        id: true, slot_id: true, member_id: true, status: true,
        waitlist_position: true, checked_in_at: true, cancelled_at: true, created_at: true,
        member: { id: true, full_name: true, email: true },
        slot: {
          id: true, gym_id: true, activity_name: true, starts_at: true,
          ends_at: true, capacity: true, booking_count: true, status: true,
        },
      },
      order: { created_at: 'DESC' },
    });
  }

  async markNoShow(id: string, user: StaffJwtPayload) {
    const booking = await this.bookingRepo.findOne({ where: { id }, relations: { slot: true } });
    if (!booking) throw new NotFoundException('Booking not found');
    await assertGymAccess(booking.slot.gym_id, user, this.gymRepo);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new ConflictException(`Only confirmed bookings can be marked no-show (is ${booking.status})`);
    }
    if (booking.slot.starts_at > new Date()) {
      throw new BadRequestException('Class has not started yet');
    }
    booking.status = BookingStatus.NO_SHOW;
    await this.bookingRepo.save(booking);
    return { message: 'Marked as no-show' };
  }

  // ── Member: gym-door entry QR ────────────────────────────────────────────

  // token dies with the subscription period; the scan re-checks the DB live,
  // so pause/cancel mid-period revokes entry even for already-issued codes
  async entryQr(user: MemberJwtPayload, gymId?: string) {
    const gym = gymId ?? user.primary_gym_id;
    if (!gym || !user.gym_ids.includes(gym)) throw new ForbiddenException('Access denied');
    const sub = await this.activeSubscription(user.sub, gym);
    if (!sub) {
      throw new ForbiddenException('No active subscription — renew your membership to get an entry code');
    }
    const validUntil = this.dayEnd(sub.current_period_end);
    const expiresIn = Math.max(60, Math.floor((validUntil.getTime() - Date.now()) / 1000));
    return {
      qr_token: this.jwtService.sign(
        { typ: 'entry', member_id: user.sub, gym_id: gym },
        { expiresIn },
      ),
      gym_id: gym,
      valid_until: validUntil,
    };
  }

  // ── Staff: scan endpoints (200 + allowed flag — scanner-friendly) ────────

  async checkinEntry(token: string, user: StaffJwtPayload) {
    const payload = this.verifyQr(token, 'entry');
    if (!payload) return { allowed: false, reason: 'Invalid or expired code' };
    await assertGymAccess(payload.gym_id, user, this.gymRepo);

    const member = await this.memberRepo.findOne({
      where: { id: payload.member_id },
      select: { id: true, full_name: true, email: true, photo_url: true, status: true },
    });
    if (!member) return { allowed: false, reason: 'Member not found' };

    const sub = await this.activeSubscription(payload.member_id, payload.gym_id);
    if (!sub) {
      const latest = await this.subRepo.findOne({
        where: { member_id: payload.member_id, gym_id: payload.gym_id },
        order: { created_at: 'DESC' },
      });
      const reason = !latest
        ? 'No subscription at this gym'
        : latest.status === SubscriptionStatus.ACTIVE
          ? `Subscription period ended ${latest.current_period_end}`
          : `Subscription is ${latest.status}`;
      return { allowed: false, reason, member };
    }
    return {
      allowed: true,
      member,
      subscription: { status: sub.status, plan: sub.plan.name, period_end: sub.current_period_end },
    };
  }

  async checkinBooking(token: string, user: StaffJwtPayload) {
    const payload = this.verifyQr(token, 'booking');
    if (!payload) return { allowed: false, reason: 'Invalid or expired code' };

    const booking = await this.bookingRepo.findOne({
      where: { id: payload.booking_id },
      relations: { slot: true, member: true },
    });
    if (!booking) return { allowed: false, reason: 'Booking not found' };
    await assertGymAccess(booking.slot.gym_id, user, this.gymRepo);

    const member = {
      id: booking.member.id, full_name: booking.member.full_name,
      email: booking.member.email, photo_url: booking.member.photo_url,
    };
    const cls = {
      activity_name: booking.slot.activity_name,
      starts_at: booking.slot.starts_at, location: booking.slot.location,
    };
    if (booking.slot.status !== SlotStatus.ENABLED) {
      return { allowed: false, reason: 'Class was cancelled', member, class: cls };
    }
    if (booking.status === BookingStatus.CHECKED_IN) {
      return { allowed: false, reason: `Already checked in at ${booking.checked_in_at.toISOString()}`, member, class: cls };
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      return { allowed: false, reason: `Booking is ${booking.status}`, member, class: cls };
    }
    if (booking.slot.ends_at < new Date()) {
      return { allowed: false, reason: 'Class has already ended', member, class: cls };
    }

    booking.status = BookingStatus.CHECKED_IN;
    booking.checked_in_at = new Date();
    await this.bookingRepo.save(booking);
    return { allowed: true, member, class: cls, checked_in_at: booking.checked_in_at };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async activeSubscription(memberId: string, gymId: string) {
    const today = new Date().toISOString().slice(0, 10);
    return this.subRepo.createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.member_id = :memberId AND sub.gym_id = :gymId', { memberId, gymId })
      .andWhere('sub.status = :status', { status: SubscriptionStatus.ACTIVE })
      // "paid through today or later" — no start check: renew advances the whole
      // window forward, so an early renewal has a future period_start while the
      // member is still fully paid up
      .andWhere('sub.current_period_end >= :today', { today })
      .orderBy('sub.created_at', 'DESC')
      .getOne();
  }

  // class_pack / payg plans burn one credit per non-cancelled booking made
  // during the current period; cancelling in time refunds it automatically
  // (the booking flips to cancelled, so it stops counting). Recurring plans
  // are unlimited.
  private async assertCreditsLeft(sub: MemberSubscription, memberId: string, gymId: string) {
    const plan = sub.plan;
    if (plan.type !== PlanType.PAYG && plan.type !== PlanType.CLASS_PACK) return;
    if (plan.included_credits == null) return;
    const used = await this.bookingRepo.createQueryBuilder('b')
      .innerJoin('b.slot', 's')
      .where('b.member_id = :memberId', { memberId })
      .andWhere('s.gym_id = :gymId', { gymId })
      .andWhere('b.status != :cancelled', { cancelled: BookingStatus.CANCELLED })
      .andWhere('b.created_at >= :start', { start: this.dayStart(sub.current_period_start) })
      .getCount();
    if (used >= plan.included_credits) {
      throw new ForbiddenException(
        `No class credits left (${used}/${plan.included_credits} used) — renew your pack to book`,
      );
    }
  }

  private bookingQr(booking: Booking, slot: Slot): string {
    // the class QR is worthless after the class — expire it with the slot
    const expiresIn = Math.max(60, Math.floor((slot.ends_at.getTime() - Date.now()) / 1000));
    return this.jwtService.sign(
      { typ: 'booking', booking_id: booking.id, member_id: booking.member_id, slot_id: slot.id },
      { expiresIn },
    );
  }

  private verifyQr(token: string, typ: 'entry' | 'booking'): Record<string, any> | null {
    try {
      const payload = this.jwtService.verify<Record<string, any>>(token);
      return payload.typ === typ ? payload : null;
    } catch {
      return null;
    }
  }

  // 'date' columns come back as YYYY-MM-DD strings — normalize either shape
  private dayStart(d: Date | string): Date {
    const day = typeof d === 'string' ? d : d.toISOString().slice(0, 10);
    return new Date(`${day}T00:00:00.000Z`);
  }

  private dayEnd(d: Date | string): Date {
    const day = typeof d === 'string' ? d : d.toISOString().slice(0, 10);
    return new Date(`${day}T23:59:59.999Z`);
  }
}
