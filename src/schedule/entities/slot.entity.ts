// schedule/entities/slot.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { Gym } from '../../gym/entities/gym.entity';
import { StaffUser } from '../../staff/entities/staff-user.entity';
import { SlotTemplate } from './slot-template.entity';
import { Booking } from '../../bookings/entities/booking.entity';

export enum SlotStatus {
  ENABLED  = 'enabled',
  DISABLED = 'disabled',
}

@Entity('slots')
export class Slot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: true })
  template_id!: string;

  @ManyToOne(() => SlotTemplate, (t) => t.slots, { nullable: true })
  @JoinColumn({ name: 'template_id' })
  template!: SlotTemplate;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.slots)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column()
  instructor_id!: string;

  @ManyToOne(() => StaffUser)
  @JoinColumn({ name: 'instructor_id' })
  instructor!: StaffUser;

  @Column()
  activity_name!: string;

  @Column({ nullable: true })
  location!: string;

  @Column()
  starts_at!: Date;

  @Column()
  ends_at!: Date;

  @Column()
  capacity!: number;

  @Column({ default: 0 })
  booking_count!: number;

  @Column({ type: 'enum', enum: SlotStatus, default: SlotStatus.ENABLED })
  status!: SlotStatus;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => Booking, (b) => b.slot)
  bookings!: Booking[];
}