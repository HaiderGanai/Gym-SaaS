// gym/entities/gym.entity.ts
import { NotificationLog } from 'src/communication/entities/notification-log.entity';
import { Invoice } from 'src/invoices/entities/invoice.entity';
import { MemberGymAccess } from 'src/members/entities/member-gym-access.entity';
import { Waiver } from 'src/members/entities/waiver.entity';
import { Organization } from 'src/organization/entities/organization.entity';
import { Discount } from 'src/plans/entities/discount.entity';
import { MembershipPlan } from 'src/plans/entities/membership-plan.entity';
import { SlotTemplate } from 'src/schedule/entities/slot-template.entity';
import { Slot } from 'src/schedule/entities/slot.entity';
import { StaffGymAccess } from 'src/staff/entities/staff-gym-access.entity';
import { MemberSubscription } from 'src/subscriptions/entities/member-subscription.entity';
import { VatPeriodSummary } from 'src/vat/entities/vat-period-summary.entity';
import { Attendance } from 'src/bookings/entities/attendance.entity';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';

export enum TaxMode {
  VAT = 'vat',
  SALES_TAX = 'sales_tax',
  NONE = 'none',
}

export enum GymType {
  GENERAL_GYM = 'general_gym',
  SWIMMING = 'swimming',
  BOXING = 'boxing',
  KARATE = 'karate',
  MMA = 'mma',
}

@Entity('gyms')
export class Gym {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  organization_id!: string;

  @ManyToOne(() => Organization, (org) => org.gyms)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column()
  name!: string;

  @Column({ nullable: true })
  address!: string;

  @Column({ nullable: true })
  timezone!: string;

  @Column({ type: 'enum', enum: GymType, default: GymType.GENERAL_GYM })
  type!: GymType;

  @Column({ type: 'enum', enum: TaxMode, default: TaxMode.VAT })
  tax_mode!: TaxMode;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 20.00 })
  default_tax_rate!: number;

  @Column({ default: true })
  tax_inclusive!: boolean;

  @Column({ nullable: true })
  vat_number!: string;

  @Column({ nullable: true })
  stripe_account_id!: string;

  @Column({ nullable: true })
  gocardless_merchant_id!: string;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => StaffGymAccess, (a) => a.gym)
  staff_access!: StaffGymAccess[];

  @OneToMany(() => MemberGymAccess, (a) => a.gym)
  member_access!: MemberGymAccess[];

  @OneToMany(() => MembershipPlan, (p) => p.gym)
  plans!: MembershipPlan[];

  @OneToMany(() => Discount, (d) => d.gym)
  discounts!: Discount[];

  @OneToMany(() => SlotTemplate, (t) => t.gym)
  slot_templates!: SlotTemplate[];

  @OneToMany(() => Slot, (s) => s.gym)
  slots!: Slot[];

  @OneToMany(() => MemberSubscription, (s) => s.gym)
  subscriptions!: MemberSubscription[];

  @OneToMany(() => Invoice, (i) => i.gym)
  invoices!: Invoice[];

  @OneToMany(() => VatPeriodSummary, (v) => v.gym)
  vat_summaries!: VatPeriodSummary[];

  @OneToMany(() => NotificationLog, (n) => n.gym)
  notification_logs!: NotificationLog[];

  @OneToMany(() => Waiver, (w) => w.gym)
  waivers!: Waiver[];

  @OneToMany(() => Attendance, (a) => a.gym)
  attendances!: Attendance[];
}
