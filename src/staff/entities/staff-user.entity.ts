// staff/entities/staff-user.entity.ts
import { Organization } from 'src/organization/entities/organization.entity';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { StaffGymAccess } from './staff-gym-access.entity';

export enum StaffRole {
  ORG_OWNER   = 'org_owner',
  ORG_ADMIN   = 'org_admin',
  GYM_MANAGER = 'gym_manager',
  FRONT_DESK  = 'front_desk',
}

@Entity('staff_users')
export class StaffUser {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  organization_id!: string;

  @ManyToOne(() => Organization, (org) => org.staff)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ unique: true })
  email!: string;

  @Column()
  password_hash!: string;

  @Column({ type: 'enum', enum: StaffRole })
  role!: StaffRole;

  @Column({ default: true })
  is_active!: boolean;

  @Column({ nullable: true })
  invite_token!: string;

  @Column({ nullable: true })
  invite_expires_at!: Date;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => StaffGymAccess, (a) => a.staff_user)
  gym_access!: StaffGymAccess[];

  // access this staff granted to others
  @OneToMany(() => StaffGymAccess, (a) => a.granted_by_staff)
  access_granted!: StaffGymAccess[];
}