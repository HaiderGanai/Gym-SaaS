// communication/entities/notification-log.entity.ts
import { Gym } from 'src/gym/entities/gym.entity';
import { Member } from 'src/members/entities/member.entity';
import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';

export enum NotificationChannel {
  EMAIL = 'email',
  PUSH  = 'push',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT    = 'sent',
  FAILED  = 'failed',
}

@Entity('notification_logs')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.notification_logs)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ nullable: true })
  member_id!: string;

  @ManyToOne(() => Member, (m) => m.notification_logs, { nullable: true })
  @JoinColumn({ name: 'member_id' })
  member!: Member;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel!: NotificationChannel;

  @Column()
  type!: string;

  @Column({ nullable: true })
  subject!: string;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.PENDING })
  status!: NotificationStatus;

  @Column({ nullable: true })
  sent_at!: Date;
}