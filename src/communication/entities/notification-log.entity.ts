// communication/entities/notification-log.entity.ts
import { Gym } from 'src/gym/entities/gym.entity';
import { Member } from 'src/members/entities/member.entity';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';

export enum DeliveryStatus {
  SKIPPED = 'skipped', // channel never attempted (e.g. no device token registered)
  SENT    = 'sent',
  FAILED  = 'failed',
}

// One row per notification *event* (not per channel) — this is both the
// member's in-app notification feed and the delivery audit trail.
@Entity('notification_logs')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.notification_logs)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column()
  member_id!: string;

  @ManyToOne(() => Member, (m) => m.notification_logs)
  @JoinColumn({ name: 'member_id' })
  member!: Member;

  // e.g. 'waitlist_promoted' | 'slot_disabled' | 'invoice_ready' | 'booking_reminder' | 'announcement'
  @Column()
  type!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  // deep-link payload for the app, e.g. { booking_id, slot_id }
  @Column({ type: 'jsonb', nullable: true })
  data!: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.SKIPPED })
  email_status!: DeliveryStatus;

  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.SKIPPED })
  push_status!: DeliveryStatus;

  @Column({ default: false })
  is_read!: boolean;

  @Column({ nullable: true })
  read_at!: Date;

  @CreateDateColumn()
  created_at!: Date;
}
