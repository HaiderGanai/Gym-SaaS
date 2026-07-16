import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { StaffService } from '../staff/staff.service';
import { MembersService } from '../members/members.service';
import { Organization } from '../organization/entities/organization.entity';
import { StaffUser, StaffRole } from '../staff/entities/staff-user.entity';
import { StaffLoginDto } from './dto/staff-login.dto';
import { OrgSignupDto } from './dto/org-signup.dto';
import { MemberLoginDto } from './dto/member-login.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AcceptMemberInviteDto } from '../members/dto/accept-member-invite.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { StaffJwtPayload, MemberJwtPayload } from '../common/interfaces/jwt-payload.interface';

const RESET_SENT = { message: 'If that email is registered, an OTP has been sent.' };

@Injectable()
export class AuthService {
  constructor(
    private staffService: StaffService,
    private membersService: MembersService,
    private jwtService: JwtService,
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    @InjectRepository(StaffUser) private staffRepo: Repository<StaffUser>,
  ) {}

  // ── Org self-signup (platform onboarding) ───────────────────────────────────
  // Creates the organization (subscription_status: pending — dashboard locked
  // until Stripe checkout completes) plus its org_admin, and logs them in.
  async orgSignup(dto: OrgSignupDto): Promise<{ access_token: string; organization: Organization }> {
    const existing = await this.staffService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const org = await this.orgRepo.save(this.orgRepo.create({
      name: dto.organization_name,
      currency: dto.currency ?? 'GBP',
    }));
    const staff = await this.staffRepo.save(this.staffRepo.create({
      organization_id: org.id,
      email: dto.email,
      password_hash: await bcrypt.hash(dto.password, 10),
      role: StaffRole.ORG_ADMIN,
    }));

    const payload: StaffJwtPayload = {
      sub: staff.id, email: staff.email, role: staff.role, org_id: org.id, gym_ids: [],
    };
    return { access_token: this.jwtService.sign(payload), organization: org };
  }

  async loginStaff(dto: StaffLoginDto) {
    const staff = await this.staffService.findByEmail(dto.email);
    if (!staff || !staff.is_active) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(dto.password, staff.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const gym_ids = await this.staffService.getActiveGymIds(staff.id);
    const payload: StaffJwtPayload = { sub: staff.id, email: staff.email, role: staff.role, org_id: staff.organization_id, gym_ids };
    return { access_token: this.jwtService.sign(payload), organization: await this.orgBranding(staff.organization_id) };
  }

  async loginMember(dto: MemberLoginDto) {
    const member = await this.membersService.findByEmail(dto.email);
    if (!member) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(dto.password, member.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const { gym_ids, primary_gym_id } = await this.membersService.getActiveGymAccess(member.id);
    const payload: MemberJwtPayload = { sub: member.id, email: member.email, gym_ids, primary_gym_id, status: member.status };
    return { access_token: this.jwtService.sign(payload), organization: await this.orgBrandingByGym(primary_gym_id) };
  }

  async acceptStaffInvite(dto: AcceptInviteDto) {
    const staff = await this.staffService.acceptInvite(dto.token, dto.password);
    const gym_ids = await this.staffService.getActiveGymIds(staff.id);
    const payload: StaffJwtPayload = { sub: staff.id, email: staff.email, role: staff.role, org_id: staff.organization_id, gym_ids };
    return { access_token: this.jwtService.sign(payload), organization: await this.orgBranding(staff.organization_id) };
  }

  async acceptMemberInvite(dto: AcceptMemberInviteDto) {
    const member = await this.membersService.acceptMemberInvite(dto);
    const { gym_ids, primary_gym_id } = await this.membersService.getActiveGymAccess(member.id);
    const payload: MemberJwtPayload = { sub: member.id, email: member.email, gym_ids, primary_gym_id, status: member.status };
    return { access_token: this.jwtService.sign(payload), organization: await this.orgBrandingByGym(primary_gym_id) };
  }

  // ── Org branding at login ────────────────────────────────────────────────────
  // Shipped with every login/invite-accept response so the app can theme itself
  // before making any authenticated call. null for super_admin (no org).

  private async orgBranding(orgId: string | null) {
    if (!orgId) return null;
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    return org ? this.brandingShape(org) : null;
  }

  // members have no org_id — their organization is reached through the primary gym
  private async orgBrandingByGym(gymId?: string) {
    if (!gymId) return null;
    const org = await this.orgRepo.createQueryBuilder('o')
      .innerJoin('o.gyms', 'g', 'g.id = :gymId', { gymId })
      .getOne();
    return org ? this.brandingShape(org) : null;
  }

  private brandingShape(org: Organization) {
    return { id: org.id, name: org.name, logo_url: org.logo_url, branding: org.branding };
  }

  // ── Forgot / reset (unauthenticated) ────────────────────────────────────────

  async forgotStaffPassword(dto: ForgotPasswordDto) {
    await this.staffService.forgotPassword(dto.email);
    return RESET_SENT;
  }

  async resetStaffPassword(dto: ResetPasswordDto) {
    await this.staffService.resetPassword(dto.email, dto.otp, dto.password);
    return { message: 'Password reset successfully. You can now log in.' };
  }

  async forgotMemberPassword(dto: ForgotPasswordDto) {
    await this.membersService.forgotPassword(dto.email);
    return RESET_SENT;
  }

  async resetMemberPassword(dto: ResetPasswordDto) {
    await this.membersService.resetPassword(dto.email, dto.otp, dto.password);
    return { message: 'Password reset successfully. You can now log in.' };
  }

  // ── Change password (authenticated) ─────────────────────────────────────────

  async sendStaffChangeOtp(staffId: string) {
    await this.staffService.sendChangePasswordOtp(staffId);
    return { message: 'OTP sent to your registered email.' };
  }

  async changeStaffPassword(staffId: string, dto: ChangePasswordDto) {
    await this.staffService.changePassword(staffId, dto.otp, dto.new_password);
    return { message: 'Password changed successfully.' };
  }

  async sendMemberChangeOtp(memberId: string) {
    await this.membersService.sendChangePasswordOtp(memberId);
    return { message: 'OTP sent to your registered email.' };
  }

  async changeMemberPassword(memberId: string, dto: ChangePasswordDto) {
    await this.membersService.changePassword(memberId, dto.otp, dto.new_password);
    return { message: 'Password changed successfully.' };
  }
}
