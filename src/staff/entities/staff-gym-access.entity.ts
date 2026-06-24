// staff/entities/staff-gym-access.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { StaffUser } from './staff-user.entity';
import { Gym } from 'src/gym/entities/gym.entity';

@Unique(['staff_id', 'gym_id'])
@Entity('staff_gym_access')
export class StaffGymAccess {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  staff_id!: string;

  @ManyToOne(() => StaffUser, (s) => s.gym_access)
  @JoinColumn({ name: 'staff_id' })
  staff_user!: StaffUser;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.staff_access)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ default: true })
  is_active!: boolean;

  @Column({ nullable: true })
  granted_by!: string;

  // forwardRef not needed — granted_by is a nullable FK,
  // loaded separately to avoid circular eager load
  @ManyToOne(() => StaffUser, (s) => s.access_granted, { nullable: true })
  @JoinColumn({ name: 'granted_by' })
  granted_by_staff!: StaffUser;

  @CreateDateColumn()
  granted_at!: Date;

  @Column({ nullable: true })
  revoked_at!: Date;
}