// bookings/entities/booking.entity.ts
import { Member } from 'src/members/entities/member.entity';
import { Slot } from 'src/schedule/entities/slot.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export enum BookingStatus {
  CONFIRMED = 'confirmed',
  WAITLISTED = 'waitlisted',
  CHECKED_IN = 'checked_in',
  NO_SHOW = 'no_show',
  CANCELLED = 'cancelled',
}

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  slot_id!: string;

  @ManyToOne(() => Slot, (s) => s.bookings)
  @JoinColumn({ name: 'slot_id' })
  slot!: Slot;

  @Column()
  member_id!: string;

  @ManyToOne(() => Member, (m) => m.bookings)
  @JoinColumn({ name: 'member_id' })
  member!: Member;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.CONFIRMED,
  })
  status!: BookingStatus;

  @Column({ nullable: true })
  waitlist_position!: number;

  @Column({ nullable: true })
  qr_token!: string;

  @Column({ nullable: true })
  checked_in_at!: Date;

  @Column({ nullable: true })
  cancelled_at!: Date;

  @CreateDateColumn()
  created_at!: Date;
}
