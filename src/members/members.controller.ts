import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';
import { MembersService } from './members.service';
import { RegisterMemberDto } from './dto/register-member.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { SignWaiverDto } from './dto/sign-waiver.dto';
import { Public } from '../auth/decorators/public.decorator';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { MemberJwtGuard } from '../auth/guards/member-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload, MemberJwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('members')
export class MembersController {
  constructor(private membersService: MembersService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterMemberDto) {
    return this.membersService.register(dto);
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.GYM_MANAGER, StaffRole.FRONT_DESK)
  @Post('invite')
  inviteMember(
    @Body() dto: InviteMemberDto,
    @CurrentUser() staff: StaffJwtPayload,
  ) {
    return this.membersService.inviteMember(dto, staff.sub);
  }

  @UseGuards(MemberJwtGuard)
  @Post('waiver')
  signWaiver(
    @Body() dto: SignWaiverDto,
    @CurrentUser() member: MemberJwtPayload,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? '';
    return this.membersService.signWaiver(member.sub, dto, ip);
  }
}
