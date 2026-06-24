// schedule/entities/slot-template.entity.ts
import { Gym } from 'src/gym/entities/gym.entity';
import { StaffUser } from 'src/staff/entities/staff-user.entity';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { Slot } from './slot.entity';

@Entity('slot_templates')
export class SlotTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.slot_templates)
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
  capacity!: number;

  @Column()
  rrule!: string;

  @Column({ default: 24 })
  booking_window_hours!: number;

  @Column({ default: 2 })
  cancellation_cutoff_hours!: number;

  @Column({ default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => Slot, (s) => s.template)
  slots!: Slot[];
}