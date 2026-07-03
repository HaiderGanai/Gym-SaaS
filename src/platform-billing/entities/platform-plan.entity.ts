// platform-billing/entities/platform-plan.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum PlanInterval {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

// Platform-level plan an ORGANIZATION buys from the super admin.
// Not to be confused with MembershipPlan (what a member buys from a gym).
@Entity('platform_plans')
export class PlatformPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'enum', enum: PlanInterval })
  interval!: PlanInterval;

  // display value only — Stripe Price is the billing source of truth
  @Column('decimal', { precision: 10, scale: 2 })
  price_per_branch!: string;

  @Column({ default: 'GBP' })
  currency!: string;

  @Column()
  stripe_product_id!: string;

  @Column()
  stripe_price_id!: string;

  @Column({ default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;
}
