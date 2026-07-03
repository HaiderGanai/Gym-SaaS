import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { StaffLoginDto } from './dto/staff-login.dto';
import { MemberLoginDto } from './dto/member-login.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AcceptMemberInviteDto } from '../members/dto/accept-member-invite.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { OrgSignupDto } from './dto/org-signup.dto';
import { Public } from './decorators/public.decorator';
import { SkipSubscriptionCheck } from '../common/decorators/skip-subscription.decorator';
import { StaffJwtGuard } from './guards/staff-jwt.guard';
import { MemberJwtGuard } from './guards/member-jwt.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { StaffJwtPayload, MemberJwtPayload } from '../common/interfaces/jwt-payload.interface';

@SkipSubscriptionCheck() // auth must work even when the org subscription is locked
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ── Org self-signup (platform onboarding) ────────────────────────────────────

  @Public()
  @Post('org/signup')
  orgSignup(@Body() dto: OrgSignupDto) {
    return this.authService.orgSignup(dto);
  }

  // ── Login ────────────────────────────────────────────────────────────────────

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

  // ── Invite accept ────────────────────────────────────────────────────────────

  @Public()
  @Post('staff/invite/accept')
  acceptStaffInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptStaffInvite(dto);
  }

  @Public()
  @Post('member/invite/accept')
  acceptMemberInvite(@Body() dto: AcceptMemberInviteDto) {
    return this.authService.acceptMemberInvite(dto);
  }

  // ── Forgot / reset password (unauthenticated) ────────────────────────────────

  @Public()
  @Post('staff/forgot-password')
  forgotStaffPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotStaffPassword(dto);
  }

  @Public()
  @Post('staff/reset-password')
  resetStaffPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetStaffPassword(dto);
  }

  @Public()
  @Post('member/forgot-password')
  forgotMemberPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotMemberPassword(dto);
  }

  @Public()
  @Post('member/reset-password')
  resetMemberPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetMemberPassword(dto);
  }

  // ── Change password (authenticated) ─────────────────────────────────────────

  @UseGuards(StaffJwtGuard)
  @Post('staff/change-password/send-otp')
  sendStaffChangeOtp(@CurrentUser() user: StaffJwtPayload) {
    return this.authService.sendStaffChangeOtp(user.sub);
  }

  @UseGuards(StaffJwtGuard)
  @Post('staff/change-password')
  changeStaffPassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: StaffJwtPayload) {
    return this.authService.changeStaffPassword(user.sub, dto);
  }

  @UseGuards(MemberJwtGuard)
  @Post('member/change-password/send-otp')
  sendMemberChangeOtp(@CurrentUser() user: MemberJwtPayload) {
    return this.authService.sendMemberChangeOtp(user.sub);
  }

  @UseGuards(MemberJwtGuard)
  @Post('member/change-password')
  changeMemberPassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: MemberJwtPayload) {
    return this.authService.changeMemberPassword(user.sub, dto);
  }
}
