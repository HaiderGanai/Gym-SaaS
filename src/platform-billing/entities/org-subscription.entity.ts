// platform-billing/entities/org-subscription.entity.ts
import { Organization } from 'src/organization/entities/organization.entity';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { PlatformPlan } from './platform-plan.entity';
import { SubscriptionStatus } from './subscription-status.enum';

// The org → platform subscription. One live row per organization
// (older rows are kept as history).
@Entity('org_subscriptions')
export class OrgSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  organization_id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column()
  plan_id!: string;

  @ManyToOne(() => PlatformPlan)
  @JoinColumn({ name: 'plan_id' })
  plan!: PlatformPlan;

  @Column({ nullable: true })
  stripe_subscription_id!: string;

  // how many branches (gyms) the org has paid for — Stripe quantity
  @Column({ default: 1 })
  branch_count!: number;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.PENDING })
  status!: SubscriptionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  current_period_end!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  grace_ends_at!: Date | null;

  @Column({ default: false })
  cancel_at_period_end!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
