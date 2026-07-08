import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { StaffUser, StaffRole } from './entities/staff-user.entity';
import { StaffGymAccess } from './entities/staff-gym-access.entity';
import { Gym } from '../gym/entities/gym.entity';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { MailService } from '../communication/mail.service';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

// Fields safe to return to clients (no hashes or tokens)
const SAFE_SELECT = {
  id: true,
  email: true,
  role: true,
  is_active: true,
  organization_id: true,
  created_at: true,
} as const;

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(StaffUser)
    private staffRepo: Repository<StaffUser>,
    @InjectRepository(StaffGymAccess)
    private accessRepo: Repository<StaffGymAccess>,
    @InjectRepository(Gym)
    private gymRepo: Repository<Gym>,
    private mailService: MailService,
  ) {}

  // ── Existing helpers used by AuthService ────────────────────────────────────

  findByEmail(email: string): Promise<StaffUser | null> {
    return this.staffRepo.findOne({ where: { email } });
  }

  async getActiveGymIds(staffId: string): Promise<string[]> {
    const rows = await this.accessRepo.find({
      where: { staff_id: staffId, is_active: true },
      select: { gym_id: true },
    });
    return rows.map((r) => r.gym_id);
  }

  async acceptInvite(token: string, rawPassword: string): Promise<StaffUser> {
    const staff = await this.staffRepo.findOne({ where: { invite_token: token } });
    if (!staff) throw new NotFoundException('Invite token not found');
    if (!staff.invite_expires_at || staff.invite_expires_at < new Date()) {
      throw new BadRequestException('Invite token has expired');
    }
    staff.password_hash = await bcrypt.hash(rawPassword, 12);
    staff.invite_token = null!;
    staff.invite_expires_at = null!;
    staff.is_active = true;
    return this.staffRepo.save(staff);
  }

  async inviteStaff(dto: InviteStaffDto, invitedByOrgId: string): Promise<{ message: string }> {
    const existing = await this.staffRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('A staff account with this email already exists');

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = new Date();
    inviteExpiry.setHours(inviteExpiry.getHours() + 72);

    const placeholderHash = await bcrypt.hash(crypto.randomUUID(), 10);
    const staff = this.staffRepo.create({
      email: dto.email,
      role: dto.role,
      organization_id: invitedByOrgId,
      password_hash: placeholderHash,
      invite_token: inviteToken,
      invite_expires_at: inviteExpiry,
      is_active: false,
    });

    await this.staffRepo.save(staff);
    await this.mailService.sendStaffInvite(dto.email, dto.full_name, inviteToken);
    return { message: `Invitation sent to ${dto.email}` };
  }

  // ── Password management ─────────────────────────────────────────────────────

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private otpExpiry(): Date {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 10);
    return d;
  }

  async forgotPassword(email: string): Promise<void> {
    const staff = await this.staffRepo.findOne({ where: { email } });
    if (!staff) return;
    const otp = this.generateOtp();
    staff.reset_token = otp;
    staff.reset_token_expires_at = this.otpExpiry();
    await this.staffRepo.save(staff);
    await this.mailService.sendOtp(staff.email, staff.email, otp, 'reset');
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    const staff = await this.staffRepo.findOne({ where: { email } });
    if (!staff || staff.reset_token !== otp || !staff.reset_token_expires_at || staff.reset_token_expires_at < new Date()) {
      throw new BadRequestException('Invalid or expired OTP');
    }
    staff.password_hash = await bcrypt.hash(newPassword, 12);
    staff.reset_token = null!;
    staff.reset_token_expires_at = null!;
    await this.staffRepo.save(staff);
  }

  async sendChangePasswordOtp(staffId: string): Promise<void> {
    const staff = await this.staffRepo.findOne({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff not found');
    const otp = this.generateOtp();
    staff.reset_token = otp;
    staff.reset_token_expires_at = this.otpExpiry();
    await this.staffRepo.save(staff);
    await this.mailService.sendOtp(staff.email, staff.email, otp, 'change');
  }

  async changePassword(staffId: string, otp: string, newPassword: string): Promise<void> {
    const staff = await this.staffRepo.findOne({ where: { id: staffId } });
    if (!staff || staff.reset_token !== otp || !staff.reset_token_expires_at || staff.reset_token_expires_at < new Date()) {
      throw new BadRequestException('Invalid or expired OTP');
    }
    staff.password_hash = await bcrypt.hash(newPassword, 12);
    staff.reset_token = null!;
    staff.reset_token_expires_at = null!;
    await this.staffRepo.save(staff);
  }

  // ── Staff management (new) ──────────────────────────────────────────────────

  async findAll(user: StaffJwtPayload) {
    if (user.role === StaffRole.SUPER_ADMIN) {
      return this.staffRepo.find({ select: SAFE_SELECT, order: { created_at: 'DESC' } });
    }
    if (user.role === StaffRole.ORG_ADMIN) {
      return this.staffRepo.find({
        where: { organization_id: user.org_id! },
        select: SAFE_SELECT,
        order: { created_at: 'DESC' },
      });
    }
    // gym_manager / front_desk — return staff who share their assigned gyms
    if (!user.gym_ids.length) return [];
    const rows = await this.accessRepo.find({
      where: { gym_id: In(user.gym_ids), is_active: true },
      select: { staff_id: true },
    });
    const ids = [...new Set(rows.map((r) => r.staff_id))];
    if (!ids.length) return [];
    return this.staffRepo.find({ where: { id: In(ids) }, select: SAFE_SELECT, order: { created_at: 'DESC' } });
  }

  async findOneWithAccess(id: string, user: StaffJwtPayload) {
    const staff = await this.staffRepo.findOne({ where: { id }, select: SAFE_SELECT });
    if (!staff) throw new NotFoundException('Staff not found');

    if (user.role === StaffRole.SUPER_ADMIN) {
      // full access
    } else if (user.role === StaffRole.ORG_ADMIN) {
      if (staff.organization_id !== user.org_id) throw new ForbiddenException('Access denied');
    } else if (user.sub !== id) {
      // gym_manager / front_desk can view colleagues sharing a gym
      const shared = user.gym_ids.length
        ? await this.accessRepo.findOne({ where: { staff_id: id, gym_id: In(user.gym_ids), is_active: true } })
        : null;
      if (!shared) throw new ForbiddenException('Access denied');
    }

    const gymAccess = await this.accessRepo.find({ where: { staff_id: id } });
    return { ...staff, gym_access: gymAccess };
  }

  async update(id: string, dto: UpdateStaffDto, user: StaffJwtPayload) {
    const staff = await this.staffRepo.findOne({ where: { id } });
    if (!staff) throw new NotFoundException('Staff not found');

    if (user.role === StaffRole.ORG_ADMIN) {
      if (staff.organization_id !== user.org_id) throw new ForbiddenException('Access denied');
      if (dto.role === StaffRole.SUPER_ADMIN) throw new ForbiddenException('Cannot assign super_admin role');
      if (id === user.sub && dto.role !== undefined) throw new ForbiddenException('Cannot change your own role');
    }

    if (dto.role !== undefined) staff.role = dto.role;
    if (dto.is_active !== undefined) staff.is_active = dto.is_active;

    const saved = await this.staffRepo.save(staff);
    const { password_hash, reset_token, reset_token_expires_at, invite_token, invite_expires_at, ...safe } = saved as any;
    return safe;
  }

  async grantGymAccess(staffId: string, gymId: string, user: StaffJwtPayload): Promise<StaffGymAccess> {
    const staff = await this.staffRepo.findOne({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff not found');

    if (user.role === StaffRole.ORG_ADMIN && staff.organization_id !== user.org_id) {
      throw new ForbiddenException('Access denied');
    }
    if (user.role === StaffRole.GYM_MANAGER && !user.gym_ids.includes(gymId)) {
      throw new ForbiddenException('Gym managers can only grant access to their own assigned gyms');
    }

    const gym = await this.gymRepo.findOne({ where: { id: gymId } });
    if (!gym) throw new NotFoundException('Gym not found');
    if (user.role !== StaffRole.SUPER_ADMIN && gym.organization_id !== user.org_id) {
      throw new ForbiddenException('Gym does not belong to your organization');
    }

    let access = await this.accessRepo.findOne({ where: { staff_id: staffId, gym_id: gymId } });
    if (access) {
      if (access.is_active) throw new ConflictException('Staff already has active access to this gym');
      access.is_active = true;
      access.revoked_at = null!;
      access.granted_by = user.sub;
    } else {
      access = this.accessRepo.create({ staff_id: staffId, gym_id: gymId, granted_by: user.sub, is_active: true });
    }
    return this.accessRepo.save(access);
  }

  async revokeGymAccess(staffId: string, gymId: string, user: StaffJwtPayload): Promise<{ message: string }> {
    const staff = await this.staffRepo.findOne({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff not found');

    if (user.role === StaffRole.ORG_ADMIN && staff.organization_id !== user.org_id) {
      throw new ForbiddenException('Access denied');
    }
    // mirrors grantGymAccess: managers manage access only at their own branches
    if (user.role === StaffRole.GYM_MANAGER && !user.gym_ids.includes(gymId)) {
      throw new ForbiddenException('Gym managers can only revoke access to their own assigned gyms');
    }

    const access = await this.accessRepo.findOne({
      where: { staff_id: staffId, gym_id: gymId, is_active: true },
    });
    if (!access) throw new NotFoundException('Active gym access not found');

    access.is_active = false;
    access.revoked_at = new Date();
    await this.accessRepo.save(access);

    return { message: 'Gym access revoked successfully' };
  }
}
