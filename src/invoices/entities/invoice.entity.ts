// invoices/entities/invoice.entity.ts
import { Gym } from 'src/gym/entities/gym.entity';
import { Member } from 'src/members/entities/member.entity';
import { MemberSubscription } from 'src/subscriptions/entities/member-subscription.entity';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';

export enum InvoiceStatus {
  PENDING  = 'pending',
  PAID     = 'paid',
  FAILED   = 'failed',
  REFUNDED = 'refunded',
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  member_id!: string;

  @ManyToOne(() => Member, (m) => m.invoices)
  @JoinColumn({ name: 'member_id' })
  member!: Member;

  @Column()
  subscription_id!: string;

  @ManyToOne(() => MemberSubscription, (s) => s.invoices)
  @JoinColumn({ name: 'subscription_id' })
  subscription!: MemberSubscription;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.invoices)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.PENDING })
  status!: InvoiceStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  tax_amount!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  tax_rate!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  net_amount!: number;

  @Column({ default: 'GBP' })
  currency!: string;

  @Column({ nullable: true })
  vat_number_snapshot!: string;  // frozen at creation

  @Column({ nullable: true })
  invoice_number!: string;       // e.g. INV-2024-00142, sequential per gym

  // manual billing v1: how the front desk collected ('cash' | 'card' | 'other')
  @Column({ nullable: true })
  payment_method!: string;

  @Column({ nullable: true })
  stripe_payment_intent_id!: string;

  @Column({ default: 0 })
  retry_count!: number;

  @Column({ nullable: true })
  next_retry_at!: Date;

  @Column({ nullable: true })
  paid_at!: Date;

  @CreateDateColumn()
  created_at!: Date;
}