// reports/entities/ai-report.entity.ts
import { Gym } from 'src/gym/entities/gym.entity';
import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';

@Entity('ai_reports')
export class AiReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.ai_reports)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: 'jsonb' })
  raw_metrics!: {
    bookings_today: number;
    revenue_today: number;
    check_ins: number;
    no_shows: number;
    new_members: number;
    failed_payments: number;
    churn_risk_members: string[];
  };

  @Column({ type: 'date' })
  report_date!: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  generated_at!: Date;
}