import {
  Injectable, NotFoundException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MembershipPlan } from './entities/membership-plan.entity';
import { Discount } from './entities/discount.entity';
import { Gym } from '../gym/entities/gym.entity';
import {
  MemberSubscription, SubscriptionStatus,
} from '../subscriptions/entities/member-subscription.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { scopedGymIds, assertGymAccess } from '../common/utils/gym-scope';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(MembershipPlan)
    private planRepo: Repository<MembershipPlan>,
    @InjectRepository(Discount)
    private discountRepo: Repository<Discount>,
    @InjectRepository(Gym)
    private gymRepo: Repository<Gym>,
    @InjectRepository(MemberSubscription)
    private subRepo: Repository<MemberSubscription>,
  ) {}

  // ── Plans ────────────────────────────────────────────────────────────────

  async createPlan(dto: CreatePlanDto, user: StaffJwtPayload): Promise<MembershipPlan> {
    await assertGymAccess(dto.gym_id, user, this.gymRepo);
    const plan = this.planRepo.create(dto);
    return this.planRepo.save(plan);
  }

  async findAllPlans(user: StaffJwtPayload, gymId?: string, includeArchived = false) {
    const ids = await this.gymFilter(user, gymId);
    return this.planRepo.find({
      where: {
        ...(ids ? { gym_id: In(ids) } : {}),
        ...(includeArchived ? {} : { is_archived: false }),
      },
      order: { created_at: 'DESC' },
    });
  }

  async findOnePlan(id: string, user: StaffJwtPayload): Promise<MembershipPlan> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    await assertGymAccess(plan.gym_id, user, this.gymRepo);
    return plan;
  }

  // returns active_subscriptions so the frontend can warn about editing a live plan
  async updatePlan(id: string, dto: UpdatePlanDto, user: StaffJwtPayload) {
    const plan = await this.findOnePlan(id, user);
    const activeSubs = await this.subRepo.count({
      where: { plan_id: id, status: SubscriptionStatus.ACTIVE },
    });
    Object.assign(plan, dto);
    const saved = await this.planRepo.save(plan);
    return { ...saved, active_subscriptions: activeSubs };
  }

  // DELETE = archive (soft) — active subscriptions keep pointing at the plan
  async archivePlan(id: string, user: StaffJwtPayload) {
    const plan = await this.findOnePlan(id, user);
    plan.is_archived = true;
    await this.planRepo.save(plan);
    return { message: 'Plan archived. Existing subscriptions are unaffected; new sign-ups are blocked.' };
  }

  // ── Discounts ────────────────────────────────────────────────────────────

  async createDiscount(dto: CreateDiscountDto, user: StaffJwtPayload): Promise<Discount> {
    await assertGymAccess(dto.gym_id, user, this.gymRepo);
    const existing = await this.discountRepo.findOne({
      where: { gym_id: dto.gym_id, code: dto.code, is_active: true },
    });
    if (existing) throw new ConflictException('An active discount with this code already exists for this gym');
    const discount = this.discountRepo.create({ ...dto, expires_at: dto.expires_at as unknown as Date });
    return this.discountRepo.save(discount);
  }

  async findAllDiscounts(user: StaffJwtPayload, gymId?: string) {
    const ids = await this.gymFilter(user, gymId);
    return this.discountRepo.find({
      where: ids ? { gym_id: In(ids) } : {},
      order: { created_at: 'DESC' },
    });
  }

  async updateDiscount(id: string, dto: UpdateDiscountDto, user: StaffJwtPayload): Promise<Discount> {
    const discount = await this.discountRepo.findOne({ where: { id } });
    if (!discount) throw new NotFoundException('Discount not found');
    await assertGymAccess(discount.gym_id, user, this.gymRepo);
    Object.assign(discount, dto);
    return this.discountRepo.save(discount);
  }

  // DELETE = deactivate (soft) — rows may be referenced by subscriptions
  async deactivateDiscount(id: string, user: StaffJwtPayload) {
    const discount = await this.discountRepo.findOne({ where: { id } });
    if (!discount) throw new NotFoundException('Discount not found');
    await assertGymAccess(discount.gym_id, user, this.gymRepo);
    discount.is_active = false;
    await this.discountRepo.save(discount);
    return { message: 'Discount deactivated.' };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  // resolves the gym_id filter: explicit gymId must be within the caller's scope
  private async gymFilter(user: StaffJwtPayload, gymId?: string): Promise<string[] | null> {
    const scope = await scopedGymIds(user, this.gymRepo);
    if (gymId) {
      if (scope && !scope.includes(gymId)) throw new ForbiddenException('Access denied');
      return [gymId];
    }
    return scope;
  }
}
