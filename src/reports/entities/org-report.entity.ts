// reports/entities/org-report.entity.ts
import { Organization } from 'src/organization/entities/organization.entity';
import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';

@Entity('org_reports')
export class OrgReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  organization_id!: string;

  @ManyToOne(() => Organization, (o) => o.org_reports)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'jsonb' })
  metrics_by_gym!: {
    gym_id: string;
    gym_name: string;
    revenue: number;
    new_members: number;
    check_ins: number;
    no_shows: number;
    churn_risk: number;
  }[];

  @Column({ type: 'jsonb' })
  org_totals!: {
    total_revenue: number;
    total_members: number;
    best_performing_gym: string;
  };

  @Column({ type: 'date' })
  report_date!: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  generated_at!: Date;
}