import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { v2 as cloudinary } from 'cloudinary';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { Member, MemberStatus } from './entities/member.entity';
import { MemberGymAccess } from './entities/member-gym-access.entity';
import { Waiver } from './entities/waiver.entity';
import { Gym } from '../gym/entities/gym.entity';
import { RegisterMemberDto } from './dto/register-member.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { AcceptMemberInviteDto } from './dto/accept-member-invite.dto';
import { SignWaiverDto } from './dto/sign-waiver.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateMemberStatusDto } from './dto/update-member-status.dto';
import { MailService } from '../communication/mail.service';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

const MEMBER_SAFE_SELECT = {
  id: true,
  email: true,
  full_name: true,
  phone: true,
  photo_url: true,
  status: true,
  pause_start: true,
  resume_date: true,
  created_at: true,
} as const;

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    @InjectRepository(Member)
    private memberRepo: Repository<Member>,
    @InjectRepository(MemberGymAccess)
    private accessRepo: Repository<MemberGymAccess>,
    @InjectRepository(Waiver)
    private waiverRepo: Repository<Waiver>,
    @InjectRepository(Gym)
    private gymRepo: Repository<Gym>,
    private mailService: MailService,
    config: ConfigService,
  ) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  // ── Existing helpers used by AuthService ────────────────────────────────────

  findByEmail(email: string): Promise<Member | null> {
    return this.memberRepo.findOne({ where: { email } });
  }

  async getActiveGymAccess(
    memberId: string,
  ): Promise<{ gym_ids: string[]; primary_gym_id: string }> {
    const rows = await this.accessRepo.find({
      where: { member_id: memberId, is_active: true },
      select: { gym_id: true, is_primary: true },
    });
    const gym_ids = rows.map((r) => r.gym_id);
    const primaryRow = rows.find((r) => r.is_primary);
    return {
      gym_ids,
      primary_gym_id: primaryRow?.gym_id ?? gym_ids[0] ?? '',
    };
  }

  async register(dto: RegisterMemberDto): Promise<{ message: string; member_id: string }> {
    const existing = await this.memberRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const password_hash = await bcrypt.hash(dto.password, 12);
    const member = this.memberRepo.create({
      email: dto.email,
      full_name: dto.full_name,
      phone: dto.phone,
      password_hash,
    });
    const saved = await this.memberRepo.save(member);

    await this.accessRepo.save(
      this.accessRepo.create({
        member_id: saved.id,
        gym_id: dto.gym_id,
        is_primary: true,
        is_active: true,
      }),
    );

    return { message: 'Account created successfully. You can now log in.', member_id: saved.id };
  }

  async inviteMember(
    dto: InviteMemberDto,
    invitedByStaffId: string,
  ): Promise<{ message: string }> {
    const existing = await this.memberRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('A member account with this email already exists');

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = new Date();
    inviteExpiry.setHours(inviteExpiry.getHours() + 72);

    const placeholderHash = await bcrypt.hash(crypto.randomUUID(), 10);

    const member = this.memberRepo.create({
      email: dto.email,
      full_name: dto.full_name,
      phone: dto.phone,
      password_hash: placeholderHash,
      invite_token: inviteToken,
      invite_expires_at: inviteExpiry,
    });
    const saved = await this.memberRepo.save(member);

    await this.accessRepo.save(
      this.accessRepo.create({
        member_id: saved.id,
        gym_id: dto.gym_id,
        is_primary: true,
        is_active: true,
        granted_by: invitedByStaffId,
      }),
    );

    await this.mailService.sendMemberInvite(dto.email, dto.full_name, inviteToken);

    return { message: `Invitation sent to ${dto.email}` };
  }

  async acceptMemberInvite(dto: AcceptMemberInviteDto): Promise<Member> {
    const member = await this.memberRepo.findOne({ where: { invite_token: dto.token } });
    if (!member) throw new NotFoundException('Invite token not found');
    if (!member.invite_expires_at || member.invite_expires_at < new Date()) {
      throw new BadRequestException('Invite token has expired');
    }

    member.password_hash = await bcrypt.hash(dto.password, 12);
    member.invite_token = null!;
    member.invite_expires_at = null!;
    return this.memberRepo.save(member);
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
    const member = await this.memberRepo.findOne({ where: { email } });
    if (!member) return;

    const otp = this.generateOtp();
    member.reset_token = otp;
    member.reset_token_expires_at = this.otpExpiry();
    await this.memberRepo.save(member);

    await this.mailService.sendOtp(member.email, member.full_name, otp, 'reset');
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    const member = await this.memberRepo.findOne({ where: { email } });
    if (!member || member.reset_token !== otp || !member.reset_token_expires_at || member.reset_token_expires_at < new Date()) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    member.password_hash = await bcrypt.hash(newPassword, 12);
    member.reset_token = null!;
    member.reset_token_expires_at = null!;
    await this.memberRepo.save(member);
  }

  async sendChangePasswordOtp(memberId: string): Promise<void> {
    const member = await this.memberRepo.findOne({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Member not found');

    const otp = this.generateOtp();
    member.reset_token = otp;
    member.reset_token_expires_at = this.otpExpiry();
    await this.memberRepo.save(member);

    await this.mailService.sendOtp(member.email, member.full_name, otp, 'change');
  }

  async changePassword(memberId: string, otp: string, newPassword: string): Promise<void> {
    const member = await this.memberRepo.findOne({ where: { id: memberId } });
    if (!member || member.reset_token !== otp || !member.reset_token_expires_at || member.reset_token_expires_at < new Date()) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    member.password_hash = await bcrypt.hash(newPassword, 12);
    member.reset_token = null!;
    member.reset_token_expires_at = null!;
    await this.memberRepo.save(member);
  }

  async signWaiver(
    memberId: string,
    dto: SignWaiverDto,
    ipAddress: string,
  ): Promise<{ message: string; waiver_id: string }> {
    const existing = await this.waiverRepo.findOne({
      where: { member_id: memberId, gym_id: dto.gym_id },
    });
    if (existing) throw new ConflictException('Waiver already signed for this gym');

    const waiver = this.waiverRepo.create({
      member_id: memberId,
      gym_id: dto.gym_id,
      signature_url: dto.signature_url,
      document_url: dto.document_url,
      ip_address: ipAddress,
      signed_at: new Date(),
    });
    const saved = await this.waiverRepo.save(waiver);

    return { message: 'Waiver signed successfully', waiver_id: saved.id };
  }

  // ── Member management (new) ─────────────────────────────────────────────────

  // Resolves which gym IDs a staff caller can see members for
  private async resolveGymIds(user: StaffJwtPayload): Promise<string[]> {
    if (user.role === StaffRole.ORG_ADMIN) {
      const gyms = await this.gymRepo.find({
        where: { organization_id: user.org_id! },
        select: { id: true },
      });
      return gyms.map((g) => g.id);
    }
    return user.gym_ids; // gym_manager / front_desk
  }

  async findAll(user: StaffJwtPayload) {
    if (user.role === StaffRole.SUPER_ADMIN) {
      return this.memberRepo.find({ select: MEMBER_SAFE_SELECT, order: { created_at: 'DESC' } });
    }

    const gymIds = await this.resolveGymIds(user);
    if (!gymIds.length) return [];

    const rows = await this.accessRepo.find({
      where: { gym_id: In(gymIds), is_active: true },
      select: { member_id: true },
    });
    const ids = [...new Set(rows.map((r) => r.member_id))];
    if (!ids.length) return [];

    return this.memberRepo.find({
      where: { id: In(ids) },
      select: MEMBER_SAFE_SELECT,
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string, user: StaffJwtPayload) {
    const member = await this.memberRepo.findOne({ where: { id }, select: MEMBER_SAFE_SELECT });
    if (!member) throw new NotFoundException('Member not found');

    if (user.role !== StaffRole.SUPER_ADMIN) {
      const gymIds = await this.resolveGymIds(user);
      if (!gymIds.length) throw new ForbiddenException('Access denied');
      const access = await this.accessRepo.findOne({
        where: { member_id: id, gym_id: In(gymIds), is_active: true },
      });
      if (!access) throw new ForbiddenException('Access denied');
    }

    const gymAccess = await this.accessRepo.find({ where: { member_id: id } });
    return { ...member, gym_access: gymAccess };
  }

  async getMe(memberId: string) {
    const member = await this.memberRepo.findOne({ where: { id: memberId }, select: MEMBER_SAFE_SELECT });
    if (!member) throw new NotFoundException('Member not found');
    const gymAccess = await this.accessRepo.find({ where: { member_id: memberId, is_active: true } });
    return { ...member, gym_access: gymAccess };
  }

  async updateProfile(memberId: string, dto: UpdateMemberDto, photo?: Express.Multer.File) {
    const member = await this.memberRepo.findOne({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Member not found');

    if (dto.full_name !== undefined) member.full_name = dto.full_name;
    if (dto.phone !== undefined) member.phone = dto.phone;
    if (dto.photo_url !== undefined) member.photo_url = dto.photo_url;
    if (photo) member.photo_url = await this.uploadPhoto(photo);

    const saved = await this.memberRepo.save(member);
    const { password_hash, reset_token, reset_token_expires_at, invite_token, invite_expires_at, fcm_token, ...safe } = saved as any;
    return safe;
  }

  private async uploadPhoto(file: Express.Multer.File): Promise<string> {
    try {
      const result = await cloudinary.uploader.upload(
        `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        { folder: 'gym-saas/member-photos' },
      );
      return result.secure_url;
    } catch (err) {
      this.logger.error('Cloudinary photo upload failed', err);
      throw new InternalServerErrorException('Photo upload failed');
    }
  }

  async updateStatus(memberId: string, dto: UpdateMemberStatusDto, user: StaffJwtPayload) {
    const member = await this.memberRepo.findOne({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Member not found');

    if (user.role !== StaffRole.SUPER_ADMIN) {
      const gymIds = await this.resolveGymIds(user);
      const access = gymIds.length
        ? await this.accessRepo.findOne({ where: { member_id: memberId, gym_id: In(gymIds), is_active: true } })
        : null;
      if (!access) throw new ForbiddenException('Access denied');
    }

    member.status = dto.status;

    if (dto.status === MemberStatus.PAUSED) {
      if (dto.pause_start) member.pause_start = new Date(dto.pause_start);
      if (dto.resume_date) member.resume_date = new Date(dto.resume_date);
    } else if (dto.status === MemberStatus.ACTIVE) {
      member.pause_start = null!;
      member.resume_date = null!;
    }

    const saved = await this.memberRepo.save(member);
    const { password_hash, reset_token, reset_token_expires_at, invite_token, invite_expires_at, fcm_token, ...safe } = saved as any;
    return safe;
  }
}
