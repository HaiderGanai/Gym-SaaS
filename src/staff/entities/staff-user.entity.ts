// staff/entities/staff-user.entity.ts
import { Organization } from 'src/organization/entities/organization.entity';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { StaffGymAccess } from './staff-gym-access.entity';

export enum StaffRole {
  SUPER_ADMIN = 'super_admin', // platform owner — cross-org visibility, no org affiliation
  ORG_ADMIN   = 'org_admin',   // full control of one organization and all its branches
  GYM_MANAGER = 'gym_manager', // manages a single branch
  FRONT_DESK  = 'front_desk',  // front-desk operations only
}

@Entity('staff_users')
export class StaffUser {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: true })
  organization_id!: string | null;

  @ManyToOne(() => Organization, (org) => org.staff, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

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

  @Column({ nullable: true })
  reset_token!: string;

  @Column({ nullable: true })
  reset_token_expires_at!: Date;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => StaffGymAccess, (a) => a.staff_user)
  gym_access!: StaffGymAccess[];

  // access this staff granted to others
  @OneToMany(() => StaffGymAccess, (a) => a.granted_by_staff)
  access_granted!: StaffGymAccess[];
}