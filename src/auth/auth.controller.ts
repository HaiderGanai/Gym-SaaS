import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { StaffLoginDto } from './dto/staff-login.dto';
import { MemberLoginDto } from './dto/member-login.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AcceptMemberInviteDto } from '../members/dto/accept-member-invite.dto';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('staff/login')
  loginStaff(@Body() dto: StaffLoginDto) {
    return this.authService.loginStaff(dto);
  }

  @Public()
  @Post('member/login')
  loginMember(@Body() dto: MemberLoginDto) {
    return this.authService.loginMember(dto);
  }

  @Public()
  @Post('staff/invite/accept')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptStaffInvite(dto);
  }

  @Public()
  @Post('member/invite/accept')
  acceptMemberInvite(@Body() dto: AcceptMemberInviteDto) {
    return this.authService.acceptMemberInvite(dto);
  }
}
