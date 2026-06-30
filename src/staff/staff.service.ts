import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { StaffUser } from './entities/staff-user.entity';
import { StaffGymAccess } from './entities/staff-gym-access.entity';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { MailService } from '../communication/mail.service';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(StaffUser)
    private staffRepo: Repository<StaffUser>,
    @InjectRepository(StaffGymAccess)
    private accessRepo: Repository<StaffGymAccess>,
    private mailService: MailService,
  ) {}

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

    // placeholder hash — cannot be used to login (is_active = false)
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
    if (!staff) return; // silent — prevent email enumeration

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
}
