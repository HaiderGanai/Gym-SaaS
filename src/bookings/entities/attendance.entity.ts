import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { Member } from '../../members/entities/member.entity';
import { Gym } from '../../gym/entities/gym.entity';

// one row per member per gym per day — the unique constraint below is what
// enforces "attendance marks once per day", not application code. Written
// through BookingsService.markAttendanceOnce() from both check-in paths
// (staff-scanned personal entry QR and member-scanned desk QR).
@Unique(['member_id', 'gym_id', 'date'])
@Entity('attendances')
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  member_id!: string;

  @ManyToOne(() => Member, (m) => m.attendances)
  @JoinColumn({ name: 'member_id' })
  member!: Member;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.attendances)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'timestamp' })
  checked_in_at!: Date;

  @CreateDateColumn()
  created_at!: Date;
}
