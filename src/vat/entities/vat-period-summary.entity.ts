// vat/entities/vat-period-summary.entity.ts
import { Gym } from 'src/gym/entities/gym.entity';
import { Organization } from 'src/organization/entities/organization.entity';
import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';

export enum PeriodType {
  MONTHLY   = 'monthly',
  QUARTERLY = 'quarterly',
}

@Entity('vat_period_summaries')
export class VatPeriodSummary {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.vat_summaries)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column()
  organization_id!: string;

  @ManyToOne(() => Organization, (o) => o.vat_summaries)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'date' })
  period_start!: Date;

  @Column({ type: 'date' })
  period_end!: Date;

  @Column({ type: 'enum', enum: PeriodType })
  period_type!: PeriodType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  gross_revenue!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  net_revenue!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total_vat_collected!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  vat_rate!: number;

  @Column({ default: 0 })
  invoice_count!: number;

  @Column({ default: false })
  is_filed!: boolean;

  @Column({ nullable: true })
  filed_at!: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  generated_at!: Date;
}