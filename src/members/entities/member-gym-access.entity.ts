// members/entities/member-gym-access.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { Member } from './member.entity';
import { Gym } from 'src/gym/entities/gym.entity';
import { StaffUser } from 'src/staff/entities/staff-user.entity';

@Unique(['member_id', 'gym_id'])
@Entity('member_gym_access')
export class MemberGymAccess {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  member_id!: string;

  @ManyToOne(() => Member, (m) => m.gym_access)
  @JoinColumn({ name: 'member_id' })
  member!: Member;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.member_access)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ default: false })
  is_primary!: boolean;

  @Column({ default: true })
  is_active!: boolean;

  @Column({ nullable: true })
  granted_by!: string;

  @ManyToOne(() => StaffUser, { nullable: true })
  @JoinColumn({ name: 'granted_by' })
  granted_by_staff!: StaffUser;

  @CreateDateColumn()
  granted_at!: Date;

  @Column({ nullable: true })
  revoked_at!: Date;
}