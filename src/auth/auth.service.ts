import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { StaffService } from '../staff/staff.service';
import { MembersService } from '../members/members.service';
import { StaffLoginDto } from './dto/staff-login.dto';
import { MemberLoginDto } from './dto/member-login.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AcceptMemberInviteDto } from '../members/dto/accept-member-invite.dto';
import { StaffJwtPayload, MemberJwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private staffService: StaffService,
    private membersService: MembersService,
    private jwtService: JwtService,
  ) {}

  async loginStaff(dto: StaffLoginDto): Promise<{ access_token: string }> {
    const staff = await this.staffService.findByEmail(dto.email);
    if (!staff || !staff.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, staff.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const gym_ids = await this.staffService.getActiveGymIds(staff.id);

    const payload: StaffJwtPayload = {
      sub: staff.id,
      email: staff.email,
      role: staff.role,
      org_id: staff.organization_id,
      gym_ids,
    };
    return { access_token: this.jwtService.sign(payload) };
  }

  async loginMember(dto: MemberLoginDto): Promise<{ access_token: string }> {
    const member = await this.membersService.findByEmail(dto.email);
    if (!member) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, member.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const { gym_ids, primary_gym_id } = await this.membersService.getActiveGymAccess(member.id);

    const payload: MemberJwtPayload = {
      sub: member.id,
      email: member.email,
      gym_ids,
      primary_gym_id,
      status: member.status,
    };
    return { access_token: this.jwtService.sign(payload) };
  }

  async acceptMemberInvite(dto: AcceptMemberInviteDto): Promise<{ access_token: string }> {
    const member = await this.membersService.acceptMemberInvite(dto);
    const { gym_ids, primary_gym_id } = await this.membersService.getActiveGymAccess(member.id);

    const payload: MemberJwtPayload = {
      sub: member.id,
      email: member.email,
      gym_ids,
      primary_gym_id,
      status: member.status,
    };
    return { access_token: this.jwtService.sign(payload) };
  }

  async acceptStaffInvite(dto: AcceptInviteDto): Promise<{ access_token: string }> {
    const staff = await this.staffService.acceptInvite(dto.token, dto.password);
    const gym_ids = await this.staffService.getActiveGymIds(staff.id);

    const payload: StaffJwtPayload = {
      sub: staff.id,
      email: staff.email,
      role: staff.role,
      org_id: staff.organization_id,
      gym_ids,
    };
    return { access_token: this.jwtService.sign(payload) };
  }
}
