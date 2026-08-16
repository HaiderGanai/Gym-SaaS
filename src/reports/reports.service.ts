import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Invoice, InvoiceStatus } from '../invoices/entities/invoice.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Attendance } from '../bookings/entities/attendance.entity';
import { Slot } from '../schedule/entities/slot.entity';
import { MemberGymAccess } from '../members/entities/member-gym-access.entity';
import { MemberSubscription } from '../subscriptions/entities/member-subscription.entity';
import { Gym } from '../gym/entities/gym.entity';
import { Organization } from '../organization/entities/organization.entity';
import { StaffUser, StaffRole } from '../staff/entities/staff-user.entity';
import { MailService } from '../communication/mail.service';
import { scopedGymIds, assertGymAccess } from '../common/utils/gym-scope';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

const r2 = (n: number | string) => Math.round(Number(n) * 100) / 100;
const pct = (num: number, den: number) => (den > 0 ? r2((num / den) * 100) : 0);

type MetricRow = Record<string, string> & { gym_id: string };

export interface GymMetrics {
  gym_id: string;
  gym_name: string;
  revenue: {
    total: number;
    invoice_count: number;
    by_payment_method: { cash: number; card: number; other: number };
  };
  bookings: {
    confirmed: number;
    checked_in: number;
    no_show: number;
    cancelled: number;
    waitlisted: number;
    no_show_rate: number;
  };
  attendance: {
    fill_rate: number;
    total_capacity: number;
    total_booked: number;
    // gym check-ins (entry QR / desk QR scans, via Attendance) — distinct
    // from bookings.checked_in, which only counts class-QR scans against a
    // booked slot. A member can check into the gym without booking a class.
    gym_check_ins: number;
  };
  members: {
    new_members: number;
    active_members: number;
    active_subscriptions: number;
    cancelled_subscriptions: number;
    churn_rate: number;
  };
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Booking) private bookingRepo: Repository<Booking>,
    @InjectRepository(Attendance) private attendanceRepo: Repository<Attendance>,
    @InjectRepository(Slot) private slotRepo: Repository<Slot>,
    @InjectRepository(MemberGymAccess)
    private accessRepo: Repository<MemberGymAccess>,
    @InjectRepository(MemberSubscription)
    private subRepo: Repository<MemberSubscription>,
    @InjectRepository(Gym) private gymRepo: Repository<Gym>,
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    @InjectRepository(StaffUser) private staffRepo: Repository<StaffUser>,
    private mailService: MailService,
  ) {}

  // ── Core aggregation — one pass, works for a single gym or a whole org ──
  // 5 grouped queries regardless of how many gyms are asked for; each metric
  // family (revenue / bookings / capacity / members / subscriptions) is its
  // own query because they filter on different date columns and tables.
  private async computeMetrics(
    gyms: Gym[],
    start: Date,
    end: Date,
  ): Promise<GymMetrics[]> {
    if (!gyms.length) return [];
    const gymIds = gyms.map((g) => g.id);

    const revenueRows = await this.invoiceRepo
      .createQueryBuilder('i')
      .select('i.gym_id', 'gym_id')
      .addSelect('COALESCE(SUM(i.amount), 0)', 'total')
      .addSelect('COUNT(*)', 'invoice_count')
      .addSelect(
        `COALESCE(SUM(i.amount) FILTER (WHERE i.payment_method = 'cash'), 0)`,
        'cash',
      )
      .addSelect(
        `COALESCE(SUM(i.amount) FILTER (WHERE i.payment_method = 'card'), 0)`,
        'card',
      )
      .addSelect(
        `COALESCE(SUM(i.amount) FILTER (WHERE i.payment_method IS NULL OR i.payment_method NOT IN ('cash', 'card')), 0)`,
        'other',
      )
      .where('i.gym_id IN (:...gymIds)', { gymIds })
      .andWhere('i.status = :status', { status: InvoiceStatus.PAID })
      .andWhere('i.paid_at >= :start AND i.paid_at < :end', { start, end })
      .groupBy('i.gym_id')
      .getRawMany<MetricRow>();

    const bookingRows = await this.bookingRepo
      .createQueryBuilder('b')
      .innerJoin('b.slot', 's')
      .select('s.gym_id', 'gym_id')
      .addSelect(`COUNT(*) FILTER (WHERE b.status = 'confirmed')`, 'confirmed')
      .addSelect(
        `COUNT(*) FILTER (WHERE b.status = 'checked_in')`,
        'checked_in',
      )
      .addSelect(`COUNT(*) FILTER (WHERE b.status = 'no_show')`, 'no_show')
      .addSelect(`COUNT(*) FILTER (WHERE b.status = 'cancelled')`, 'cancelled')
      .addSelect(
        `COUNT(*) FILTER (WHERE b.status = 'waitlisted')`,
        'waitlisted',
      )
      .where('s.gym_id IN (:...gymIds)', { gymIds })
      .andWhere('s.starts_at >= :start AND s.starts_at < :end', { start, end })
      .groupBy('s.gym_id')
      .getRawMany<MetricRow>();

    const capacityRows = await this.slotRepo
      .createQueryBuilder('s')
      .select('s.gym_id', 'gym_id')
      .addSelect('COALESCE(SUM(s.capacity), 0)', 'total_capacity')
      .addSelect('COALESCE(SUM(s.booking_count), 0)', 'total_booked')
      .where('s.gym_id IN (:...gymIds)', { gymIds })
      .andWhere('s.starts_at >= :start AND s.starts_at < :end', { start, end })
      .groupBy('s.gym_id')
      .getRawMany<MetricRow>();

    // gym check-ins: Attendance is one row per member/gym/day, written by
    // both check-in methods (staff-scanned entry QR, member-scanned desk QR)
    // via the shared markAttendanceOnce() — independent of class bookings.
    const attendanceRows = await this.attendanceRepo
      .createQueryBuilder('a')
      .select('a.gym_id', 'gym_id')
      .addSelect('COUNT(*)', 'gym_check_ins')
      .where('a.gym_id IN (:...gymIds)', { gymIds })
      .andWhere('a.checked_in_at >= :start AND a.checked_in_at < :end', { start, end })
      .groupBy('a.gym_id')
      .getRawMany<MetricRow>();

    const memberRows = await this.accessRepo
      .createQueryBuilder('a')
      .select('a.gym_id', 'gym_id')
      .addSelect('COUNT(*) FILTER (WHERE a.is_active = true)', 'active_members')
      .addSelect(
        'COUNT(*) FILTER (WHERE a.granted_at >= :start AND a.granted_at < :end)',
        'new_members',
      )
      .where('a.gym_id IN (:...gymIds)', { gymIds })
      .setParameters({ start, end })
      .groupBy('a.gym_id')
      .getRawMany<MetricRow>();

    const subRows = await this.subRepo
      .createQueryBuilder('sub')
      .select('sub.gym_id', 'gym_id')
      .addSelect(
        `COUNT(*) FILTER (WHERE sub.status IN ('active', 'past_due', 'paused'))`,
        'active_subs',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE sub.status = 'cancelled' AND sub.updated_at >= :start AND sub.updated_at < :end)`,
        'cancelled_subs',
      )
      .where('sub.gym_id IN (:...gymIds)', { gymIds })
      .setParameters({ start, end })
      .groupBy('sub.gym_id')
      .getRawMany<MetricRow>();

    const find = (rows: MetricRow[], gymId: string) =>
      rows.find((r) => r.gym_id === gymId);

    return gyms.map((gym): GymMetrics => {
      const rev = find(revenueRows, gym.id);
      const bk = find(bookingRows, gym.id);
      const cap = find(capacityRows, gym.id);
      const att = find(attendanceRows, gym.id);
      const mem = find(memberRows, gym.id);
      const sub = find(subRows, gym.id);

      const checkedIn = Number(bk?.checked_in ?? 0);
      const noShow = Number(bk?.no_show ?? 0);
      const totalCapacity = Number(cap?.total_capacity ?? 0);
      const totalBooked = Number(cap?.total_booked ?? 0);
      const activeSubs = Number(sub?.active_subs ?? 0);
      const cancelledSubs = Number(sub?.cancelled_subs ?? 0);

      return {
        gym_id: gym.id,
        gym_name: gym.name,
        revenue: {
          total: r2(rev?.total ?? 0),
          invoice_count: Number(rev?.invoice_count ?? 0),
          by_payment_method: {
            cash: r2(rev?.cash ?? 0),
            card: r2(rev?.card ?? 0),
            other: r2(rev?.other ?? 0),
          },
        },
        bookings: {
          confirmed: Number(bk?.confirmed ?? 0),
          checked_in: checkedIn,
          no_show: noShow,
          cancelled: Number(bk?.cancelled ?? 0),
          waitlisted: Number(bk?.waitlisted ?? 0),
          no_show_rate: pct(noShow, checkedIn + noShow),
        },
        attendance: {
          fill_rate: pct(totalBooked, totalCapacity),
          total_capacity: totalCapacity,
          total_booked: totalBooked,
          gym_check_ins: Number(att?.gym_check_ins ?? 0),
        },
        members: {
          new_members: Number(mem?.new_members ?? 0),
          active_members: Number(mem?.active_members ?? 0),
          active_subscriptions: activeSubs,
          cancelled_subscriptions: cancelledSubs,
          // approximation: cancellations in the period against the subscriber base
          // they were drawn from (currently-active + those who just left it) —
          // there's no historical subscriber-count snapshot to divide against instead
          churn_rate: pct(cancelledSubs, activeSubs + cancelledSubs),
        },
      };
    });
  }

  private sumTotals(byGym: GymMetrics[]) {
    const t = byGym.reduce(
      (acc, g) => ({
        revenue: acc.revenue + g.revenue.total,
        invoice_count: acc.invoice_count + g.revenue.invoice_count,
        cash: acc.cash + g.revenue.by_payment_method.cash,
        card: acc.card + g.revenue.by_payment_method.card,
        other: acc.other + g.revenue.by_payment_method.other,
        checked_in: acc.checked_in + g.bookings.checked_in,
        no_show: acc.no_show + g.bookings.no_show,
        confirmed: acc.confirmed + g.bookings.confirmed,
        cancelled_bookings: acc.cancelled_bookings + g.bookings.cancelled,
        waitlisted: acc.waitlisted + g.bookings.waitlisted,
        total_capacity: acc.total_capacity + g.attendance.total_capacity,
        total_booked: acc.total_booked + g.attendance.total_booked,
        gym_check_ins: acc.gym_check_ins + g.attendance.gym_check_ins,
        new_members: acc.new_members + g.members.new_members,
        active_members: acc.active_members + g.members.active_members,
        active_subs: acc.active_subs + g.members.active_subscriptions,
        cancelled_subs: acc.cancelled_subs + g.members.cancelled_subscriptions,
      }),
      {
        revenue: 0,
        invoice_count: 0,
        cash: 0,
        card: 0,
        other: 0,
        checked_in: 0,
        no_show: 0,
        confirmed: 0,
        cancelled_bookings: 0,
        waitlisted: 0,
        total_capacity: 0,
        total_booked: 0,
        gym_check_ins: 0,
        new_members: 0,
        active_members: 0,
        active_subs: 0,
        cancelled_subs: 0,
      },
    );
    return {
      revenue: {
        total: r2(t.revenue),
        invoice_count: t.invoice_count,
        by_payment_method: {
          cash: r2(t.cash),
          card: r2(t.card),
          other: r2(t.other),
        },
      },
      bookings: {
        confirmed: t.confirmed,
        checked_in: t.checked_in,
        no_show: t.no_show,
        cancelled: t.cancelled_bookings,
        waitlisted: t.waitlisted,
        no_show_rate: pct(t.no_show, t.checked_in + t.no_show),
      },
      attendance: {
        fill_rate: pct(t.total_booked, t.total_capacity),
        total_capacity: t.total_capacity,
        total_booked: t.total_booked,
        gym_check_ins: t.gym_check_ins,
      },
      members: {
        new_members: t.new_members,
        active_members: t.active_members,
        active_subscriptions: t.active_subs,
        cancelled_subscriptions: t.cancelled_subs,
        churn_rate: pct(t.cancelled_subs, t.active_subs + t.cancelled_subs),
      },
    };
  }

  private parseRange(
    periodStart: string,
    periodEnd: string,
  ): { start: Date; end: Date } {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        'period_start/period_end must be valid dates',
      );
    }
    return { start, end };
  }

  // ── Staff-facing endpoints ───────────────────────────────────────────────

  async gymStats(
    gymId: string,
    user: StaffJwtPayload,
    periodStart: string,
    periodEnd: string,
  ): Promise<GymMetrics> {
    const gym = await assertGymAccess(gymId, user, this.gymRepo);
    const { start, end } = this.parseRange(periodStart, periodEnd);
    const [metrics] = await this.computeMetrics([gym], start, end);
    return metrics;
  }

  async orgStats(
    user: StaffJwtPayload,
    periodStart: string,
    periodEnd: string,
  ) {
    if (!user.org_id)
      throw new BadRequestException(
        'org_id required — use per-gym stats as super_admin',
      );
    const gymIds = await scopedGymIds(user, this.gymRepo);
    const gyms = await this.gymRepo.find({
      where: { organization_id: user.org_id },
      order: { name: 'ASC' },
    });
    const scoped = gymIds ? gyms.filter((g) => gymIds.includes(g.id)) : gyms;
    const { start, end } = this.parseRange(periodStart, periodEnd);
    const byGym = await this.computeMetrics(scoped, start, end);
    return {
      period_start: periodStart,
      period_end: periodEnd,
      gyms: byGym,
      totals: this.sumTotals(byGym),
    };
  }

  // ── Automated end-of-day digest to every org_admin ───────────────────────
  // Server-time midnight-to-midnight "today" — this app has no per-gym
  // timezone-aware scheduling anywhere else (see pastDueCron/graceCron/
  // horizonCron), so a multi-timezone org's digest window is approximate too.
  @Cron('55 23 * * *')
  async sendDailyDigests(): Promise<void> {
    const admins = await this.staffRepo.find({
      where: { role: StaffRole.ORG_ADMIN, is_active: true },
    });
    const orgIds = [
      ...new Set(
        admins.map((a) => a.organization_id).filter((id): id is string => !!id),
      ),
    ];
    if (!orgIds.length) return;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    for (const orgId of orgIds) {
      try {
        const gyms = await this.gymRepo.find({
          where: { organization_id: orgId },
        });
        if (!gyms.length) continue;
        const org = await this.orgRepo.findOneByOrFail({ id: orgId });
        const byGym = await this.computeMetrics(gyms, start, end);
        const totals = this.sumTotals(byGym);
        const orgAdmins = admins.filter((a) => a.organization_id === orgId);

        await Promise.allSettled(
          orgAdmins.map((admin) =>
            this.mailService
              .sendDailyDigest(
                admin.email,
                org.name,
                org.currency,
                start,
                totals,
                byGym,
              )
              .catch((err) =>
                this.logger.error(
                  `Daily digest failed for ${admin.email}`,
                  err as Error,
                ),
              ),
          ),
        );
      } catch (err) {
        this.logger.error(`Daily digest failed for org ${orgId}`, err as Error);
      }
    }
    this.logger.log(`Sent daily digests to ${orgIds.length} org(s)`);
  }
}
