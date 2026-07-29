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

  @Column({ type: 'date' })
  current_period_start!: Date;

  @Column({ type: 'date' })
  current_period_end!: Date;

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
