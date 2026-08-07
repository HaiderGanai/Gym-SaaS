import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, ConflictException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MemberSubscription, SubscriptionStatus } from './entities/member-subscription.entity';
import { MembershipPlan, PlanType } from '../plans/entities/membership-plan.entity';
import { Discount, DiscountType } from '../plans/entities/discount.entity';
import { Gym } from '../gym/entities/gym.entity';
import { Member } from '../members/entities/member.entity';
import { MemberGymAccess } from '../members/entities/member-gym-access.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { scopedGymIds } from '../common/utils/gym-scope';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(MemberSubscription)
    private subRepo: Repository<MemberSubscription>,
    @InjectRepository(MembershipPlan)
    private planRepo: Repository<MembershipPlan>,
    @InjectRepository(Discount)
    private discountRepo: Repository<Discount>,
    @InjectRepository(Gym)
    private gymRepo: Repository<Gym>,
    @InjectRepository(Member)
    private memberRepo: Repository<Member>,
    @InjectRepository(MemberGymAccess)
    private accessRepo: Repository<MemberGymAccess>,
    private invoicesService: InvoicesService,
  ) {}

  // ── Create (staff-led, manual billing) ───────────────────────────────────

  async create(dto: CreateSubscriptionDto, user: StaffJwtPayload) {
    const plan = await this.planRepo.findOne({
      where: { id: dto.plan_id },
      relations: { gym: { organization: true } },
    });
    if (!plan || plan.is_archived) throw new NotFoundException('Plan not found or archived');
    const gym = plan.gym;
    this.assertGym(gym, user);

    const member = await this.memberRepo.findOne({ where: { id: dto.member_id } });
    if (!member) throw new NotFoundException('Member not found');
    const access = await this.accessRepo.findOne({
      where: { member_id: dto.member_id, gym_id: gym.id, is_active: true },
    });
    if (!access) throw new BadRequestException('Member has no active access to this gym');

    const existing = await this.subRepo.findOne({
      where: {
        member_id: dto.member_id,
        gym_id: gym.id,
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED, SubscriptionStatus.PAST_DUE]),
      },
    });
    if (existing) {
      throw new ConflictException('Member already has an ongoing subscription at this gym — cancel it first');
    }

    // discount (optional promo code)
    let discount: Discount | null = null;
    let charge = Number(plan.price);
    if (dto.discount_code) {
      discount = await this.validateDiscount(dto.discount_code, gym.id);
      charge = this.applyDiscount(charge, discount);
    }

    const start = dto.start_date ? new Date(dto.start_date) : new Date();
    const sub = await this.subRepo.save(
      this.subRepo.create({
        member_id: dto.member_id,
        plan_id: plan.id,
        gym_id: gym.id,
        discount_id: discount?.id,
        status: SubscriptionStatus.ACTIVE,
        current_period_start: start,
        current_period_end: this.periodEnd(start, plan.type),
      }),
    );

    if (discount) {
      discount.used_count += 1;
      await this.discountRepo.save(discount);
    }

    const invoice = await this.invoicesService.createForSubscription(
      sub, plan, gym, charge, dto.mark_paid ?? false, dto.payment_method,
    );
    return { subscription: sub, invoice };
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  async findAll(
    user: StaffJwtPayload,
    filters: { gym_id?: string; member_id?: string; status?: SubscriptionStatus },
  ) {
    const scope = await scopedGymIds(user, this.gymRepo);
    if (filters.gym_id && scope && !scope.includes(filters.gym_id)) {
      throw new ForbiddenException('Access denied');
    }
    const ids = filters.gym_id ? [filters.gym_id] : scope;
    return this.subRepo.find({
      where: {
        ...(ids ? { gym_id: In(ids) } : {}),
        ...(filters.member_id ? { member_id: filters.member_id } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      relations: { plan: true, member: true },
      select: { member: { id: true, full_name: true, email: true } },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string, user: StaffJwtPayload): Promise<MemberSubscription> {
    const sub = await this.subRepo.findOne({
      where: { id },
      relations: { plan: true, member: true, discount: true, invoices: true },
      select: { member: { id: true, full_name: true, email: true } },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    const scope = await scopedGymIds(user, this.gymRepo);
    if (scope && !scope.includes(sub.gym_id)) throw new ForbiddenException('Access denied');
    return sub;
  }

  // member app: current plan summary
  findMine(memberId: string) {
    return this.subRepo.find({
      where: { member_id: memberId },
      relations: { plan: true },
      order: { created_at: 'DESC' },
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  // advances the period and issues the next invoice (front desk collects manually)
  async renew(id: string, dto: RenewSubscriptionDto, user: StaffJwtPayload) {
    const sub = await this.findOne(id, user);
    if (sub.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Cancelled subscriptions cannot be renewed — create a new one');
    }
    const plan = await this.planRepo.findOne({
      where: { id: sub.plan_id },
      relations: { gym: { organization: true } },
    });
    if (!plan) throw new NotFoundException('Plan not found');

    // lapsed subs restart today; current ones extend seamlessly
    const prevEnd = new Date(sub.current_period_end);
    const start = prevEnd < new Date() ? new Date() : prevEnd;
    sub.current_period_start = start;
    sub.current_period_end = this.periodEnd(start, plan.type);
    sub.status = SubscriptionStatus.ACTIVE;
    const saved = await this.subRepo.save(sub);

    // renewals charge full plan price — promo codes are first-invoice only
    const invoice = await this.invoicesService.createForSubscription(
      saved, plan, plan.gym, Number(plan.price), dto.mark_paid ?? false, dto.payment_method,
    );
    return { subscription: saved, invoice };
  }

  async pause(id: string, user: StaffJwtPayload) {
    const sub = await this.findOne(id, user);
    return this.applyPause(sub);
  }

  async resume(id: string, user: StaffJwtPayload) {
    const sub = await this.findOne(id, user);
    return this.applyResume(sub);
  }

  // ── Member self-service (mirrors staff pause/resume, ownership-checked) ──

  async pauseMine(id: string, memberId: string) {
    const sub = await this.findOwnedByMember(id, memberId);
    return this.applyPause(sub);
  }

  async resumeMine(id: string, memberId: string) {
    const sub = await this.findOwnedByMember(id, memberId);
    return this.applyResume(sub);
  }

  private async findOwnedByMember(id: string, memberId: string): Promise<MemberSubscription> {
    const sub = await this.subRepo.findOne({ where: { id }, relations: { plan: true } });
    if (!sub || sub.member_id !== memberId) throw new NotFoundException('Subscription not found');
    return sub;
  }

  private applyPause(sub: MemberSubscription) {
    if (sub.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException(`Only active subscriptions can be paused (current: ${sub.status})`);
    }
    sub.status = SubscriptionStatus.PAUSED;
    sub.paused_at = new Date();
    return this.subRepo.save(sub);
  }

  // shifts current_period_end forward by whole days spent paused — no
  // benefits (booking, entry QR) are granted while paused since every gate
  // checks status === active, not just an unexpired period
  private applyResume(sub: MemberSubscription) {
    if (sub.status !== SubscriptionStatus.PAUSED) {
      throw new BadRequestException(`Only paused subscriptions can be resumed (current: ${sub.status})`);
    }
    const pausedDays = Math.round((Date.now() - new Date(sub.paused_at!).getTime()) / 86_400_000);
    const newEnd = new Date(sub.current_period_end);
    newEnd.setDate(newEnd.getDate() + pausedDays);
    sub.current_period_end = newEnd;
    sub.status = SubscriptionStatus.ACTIVE;
    sub.paused_at = null;
    return this.subRepo.save(sub);
  }

  async cancel(id: string, user: StaffJwtPayload) {
    const sub = await this.findOne(id, user);
    if (sub.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Subscription is already cancelled');
    }
    sub.status = SubscriptionStatus.CANCELLED;
    return this.subRepo.save(sub);
  }

  // ── Daily housekeeping ───────────────────────────────────────────────────

  // recurring subs whose period lapsed without renewal → past_due
  // (payg / class_pack don't recur, so they never go past_due)
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async pastDueCron(): Promise<void> {
    const lapsed = await this.subRepo.find({
      where: { status: SubscriptionStatus.ACTIVE, current_period_end: LessThan(new Date()) },
      relations: { plan: true },
    });
    const recurring = lapsed.filter((s) =>
      [PlanType.MONTHLY, PlanType.WEEKLY, PlanType.YEARLY].includes(s.plan.type),
    );
    for (const sub of recurring) {
      sub.status = SubscriptionStatus.PAST_DUE;
      await this.subRepo.save(sub);
    }
    if (recurring.length) this.logger.log(`Marked ${recurring.length} subscription(s) past_due`);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private periodEnd(start: Date, type: PlanType): Date {
    const end = new Date(start);
    switch (type) {
      case PlanType.WEEKLY:  end.setDate(end.getDate() + 7); break;
      case PlanType.MONTHLY: end.setMonth(end.getMonth() + 1); break;
      case PlanType.YEARLY:  end.setFullYear(end.getFullYear() + 1); break;
      // ponytail: packs/payg get 1-year validity; per-plan validity column if gyms ask
      default:               end.setFullYear(end.getFullYear() + 1);
    }
    return end;
  }

  private async validateDiscount(code: string, gymId: string): Promise<Discount> {
    const discount = await this.discountRepo.findOne({
      where: { code, gym_id: gymId, is_active: true },
    });
    if (!discount) throw new NotFoundException('Discount code not found');
    if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
      throw new BadRequestException('Discount code has expired');
    }
    if (discount.max_uses && discount.used_count >= discount.max_uses) {
      throw new BadRequestException('Discount code has reached its usage limit');
    }
    return discount;
  }

  private applyDiscount(price: number, discount: Discount): number {
    const value = Number(discount.value);
    if (discount.type === DiscountType.PERCENTAGE) return r2(price * (1 - value / 100));
    return r2(Math.max(0, price - value));
  }

  private assertGym(gym: Gym, user: StaffJwtPayload): void {
    if (user.role === StaffRole.SUPER_ADMIN) return;
    if (user.role === StaffRole.ORG_ADMIN && user.org_id === gym.organization_id) return;
    if (user.gym_ids.includes(gym.id)) return;
    throw new ForbiddenException('Access denied');
  }
}
