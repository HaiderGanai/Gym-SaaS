// organization/entities/organization.entity.ts
import { Gym } from 'src/gym/entities/gym.entity';
import { OrgReport } from 'src/reports/entities/org-report.entity';
import { StaffUser } from 'src/staff/entities/staff-user.entity';
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