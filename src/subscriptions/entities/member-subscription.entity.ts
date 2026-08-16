// subscriptions/entities/member-subscription.entity.ts
import { Gym } from 'src/gym/entities/gym.entity';
import { Invoice } from 'src/invoices/entities/invoice.entity';
import { Member } from 'src/members/entities/member.entity';
import { Discount } from 'src/plans/entities/discount.entity';
import { MembershipPlan } from 'src/plans/entities/membership-plan.entity';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';

export enum SubscriptionStatus {
  ACTIVE   = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  PAUSED   = 'paused',
}

@Entity('member_subscriptions')
export class MemberSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  member_id!: string;

  @ManyToOne(() => Member, (m) => m.subscriptions)
  @JoinColumn({ name: 'member_id' })
  member!: Member;

  @Column()
  plan_id!: string;

  @ManyToOne(() => MembershipPlan, (p) => p.subscriptions)
  @JoinColumn({ name: 'plan_id' })
  plan!: MembershipPlan;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.subscriptions)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ nullable: true })
  discount_id!: string;

  @ManyToOne(() => Discount, { nullable: true })
  @JoinColumn({ name: 'discount_id' })
  discount!: Discount;

  @Column({ type: 'enum', enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  // utc: true — without it, TypeORM's `date` columns serialize/parse using the
  // server's LOCAL timezone (DateUtils.mixedDateToDateString), which drifts a
  // calendar day off Attendance.date (always UTC) and subscription-progress.util.ts's
  // toDate() (parses as UTC midnight) whenever the server isn't running in UTC —
  // producing days_left > total_days and check_ins undercounting.
  @Column({ type: 'date', utc: true })
  current_period_start!: Date;

  @Column({ type: 'date', utc: true })
  current_period_end!: Date;

  // set on pause, cleared on resume — resume() reads this to shift
  // current_period_end forward by the days spent paused
  @Column({ type: 'timestamp', nullable: true })
  paused_at!: Date | null;

  @Column({ nullable: true })
  stripe_subscription_id!: string;

  @Column({ nullable: true })
  gocardless_mandate_id!: string;

  @CreateDateColumn()
  created_at!: Date;

  // ReportsModule reads this to find "cancelled today" — bumps on every save,
  // including the plain status flip in cancel()/pause()/resume()
  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => Invoice, (i) => i.subscription)
  invoices!: Invoice[];
}
