import {
  Controller, Get, Post, Patch, Body, Param, UseGuards, Req,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { MembersService } from './members.service';
import { RegisterMemberDto } from './dto/register-member.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { SignWaiverDto } from './dto/sign-waiver.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateMemberStatusDto } from './dto/update-member-status.dto';
import { Public } from '../auth/decorators/public.decorator';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { MemberJwtGuard } from '../auth/guards/member-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import { ParseUUIDPipe } from '@nestjs/common';
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

  // ── Staff-facing member management ─────────────────────────────────────────

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Get()
  findAll(@CurrentUser() user: StaffJwtPayload) {
    return this.membersService.findAll(user);
  }

  // GET /members/profile — must come before GET /members/:id
  @UseGuards(MemberJwtGuard)
  @Get('profile')
  getProfile(@CurrentUser() member: MemberJwtPayload) {
    return this.membersService.getMe(member.sub);
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.membersService.findOne(id, user);
  }

  // ── Member self-management ──────────────────────────────────────────────────

  // accepts JSON, or multipart/form-data with an optional 'photo' image file
  // (uploaded to Cloudinary → photo_url)
  @UseGuards(MemberJwtGuard)
  @Patch('me')
  @UseInterceptors(FileInterceptor('photo', {
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) =>
      file.mimetype.startsWith('image/')
        ? cb(null, true)
        : cb(new BadRequestException('photo must be an image file'), false),
  }))
  updateProfile(
    @Body() dto: UpdateMemberDto,
    @CurrentUser() member: MemberJwtPayload,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.membersService.updateProfile(member.sub, dto, photo);
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberStatusDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.membersService.updateStatus(id, dto, user);
  }
}
