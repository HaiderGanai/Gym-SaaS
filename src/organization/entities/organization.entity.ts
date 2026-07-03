// organization/entities/organization.entity.ts
import { Gym } from 'src/gym/entities/gym.entity';
import { OrgReport } from 'src/reports/entities/org-report.entity';
import { StaffUser } from 'src/staff/entities/staff-user.entity';
import { SubscriptionStatus } from 'src/platform-billing/entities/subscription-status.enum';
import { VatPeriodSummary } from 'src/vat/entities/vat-period-summary.entity';
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, OneToMany,
} from 'typeorm';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  logo_url!: string;

  @Column({ default: 'GBP' })
  currency!: string;

  @Column({ nullable: true })
  stripe_customer_id!: string;

  // denormalized copy of the live OrgSubscription status — cheap per-request guard checks
  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.PENDING })
  subscription_status!: SubscriptionStatus;

  // free-form theme blob (colors, fonts, sizes…) — frontend owns the shape
  @Column({ type: 'jsonb', nullable: true })
  branding!: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => Gym, (gym) => gym.organization)
  gyms!: Gym[];

  @OneToMany(() => StaffUser, (staff) => staff.organization)
  staff!: StaffUser[];

  @OneToMany(() => VatPeriodSummary, (vat) => vat.organization)
  vat_summaries!: VatPeriodSummary[];

  @OneToMany(() => OrgReport, (report) => report.organization)
  org_reports!: OrgReport[];
}