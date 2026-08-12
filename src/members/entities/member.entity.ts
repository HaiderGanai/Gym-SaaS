// members/entities/member.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { MemberGymAccess } from './member-gym-access.entity';
import { Waiver } from './waiver.entity';
import { MemberSubscription } from '../../subscriptions/entities/member-subscription.entity';
import { Booking } from '../../bookings/entities/booking.entity';
import { Invoice } from '../../invoices/entities/invoice.entity';
import { NotificationLog } from '../../communication/entities/notification-log.entity';
import { Attendance } from '../../bookings/entities/attendance.entity';

export enum MemberStatus {
  ACTIVE    = 'active',
  PAUSED    = 'paused',
  EXPIRED   = 'expired',
  CANCELLED = 'cancelled',
}

@Entity('members')
export class Member {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  full_name!: string;

  @Column({ nullable: true })
  phone!: string;

  @Column({ nullable: true })
  photo_url!: string;

  @Column()
  password_hash!: string;

  @Column({ type: 'enum', enum: MemberStatus, default: MemberStatus.ACTIVE })
  status!: MemberStatus;

  @Column({ type: 'date', nullable: true })
  pause_start!: Date;

  @Column({ type: 'date', nullable: true })
  resume_date!: Date;

  // typed as plain `string` (not `string | null`) on purpose: this repo's
  // tsconfig (isolatedModules) makes TS emit design:type "Object" for a
  // `T | null` union, which TypeORM can't map to a column type — every other
  // nullable column here (phone, invite_token, ...) follows the same pattern
  @Column({ nullable: true })
  fcm_token!: string;

  @Column({ nullable: true })
  invite_token!: string;

  @Column({ nullable: true })
  invite_expires_at!: Date;

  @Column({ nullable: true })
  reset_token!: string;

  @Column({ nullable: true })
  reset_token_expires_at!: Date;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => MemberGymAccess, (a) => a.member)
  gym_access!: MemberGymAccess[];

  @OneToMany(() => Waiver, (w) => w.member)
  waivers!: Waiver[];

  @OneToMany(() => MemberSubscription, (s) => s.member)
  subscriptions!: MemberSubscription[];

  @OneToMany(() => Booking, (b) => b.member)
  bookings!: Booking[];

  @OneToMany(() => Attendance, (a) => a.member)
  attendances!: Attendance[];

  @OneToMany(() => Invoice, (i) => i.member)
  invoices!: Invoice[];

  @OneToMany(() => NotificationLog, (n) => n.member)
  notification_logs!: NotificationLog[];
}