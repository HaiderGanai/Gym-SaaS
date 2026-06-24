// plans/entities/membership-plan.entity.ts
import { Gym } from 'src/gym/entities/gym.entity';
import { MemberSubscription } from 'src/subscriptions/entities/member-subscription.entity';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';

export enum PlanType {
  MONTHLY    = 'monthly',
  WEEKLY     = 'weekly',
  YEARLY     = 'yearly',
  PAYG       = 'payg',
  CLASS_PACK = 'class_pack',
}

@Entity('membership_plans')
export class MembershipPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.plans)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column()
  name!: string;

  @Column({ type: 'enum', enum: PlanType })
  type!: PlanType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;

  @Column({ nullable: true })
  billing_interval!: string;

  @Column({ nullable: true })
  included_credits!: number;

  @Column({ nullable: true })
  stripe_price_id!: string;

  @Column({ default: true })
  is_vat_applicable!: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  vat_rate_override!: number;

  @Column({ default: false })
  is_archived!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => MemberSubscription, (s) => s.plan)
  subscriptions!: MemberSubscription[];
}