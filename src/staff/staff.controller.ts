import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { StaffService } from './staff.service';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { GrantGymAccessDto } from './dto/grant-gym-access.dto';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from './entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@UseGuards(StaffJwtGuard, RolesGuard)
@Controller('staff')
export class StaffController {
  constructor(private staffService: StaffService) {}

  @Post('invite')
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  inviteStaff(
    @Body() dto: InviteStaffDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    if (!user.org_id) throw new Error('Super admin must specify an org context to invite staff');
    return this.staffService.inviteStaff(dto, user.org_id);
  }

  // no @Roles — all authenticated staff; service scopes the result by role
  @Get()
  findAll(@CurrentUser() user: StaffJwtPayload) {
    return this.staffService.findAll(user);
  }

  // no @Roles — service enforces access per caller role
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.staffService.findOneWithAccess(id, user);
  }

  @Patch(':id')
  @Roles(StaffRole.ORG_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.staffService.update(id, dto, user);
  }

  @Post(':id/gym-access')
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  grantGymAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantGymAccessDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.staffService.grantGymAccess(id, dto.gym_id, user);
  }

  @Delete(':id/gym-access/:gymId')
  @Roles(StaffRole.ORG_ADMIN)
  revokeGymAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.staffService.revokeGymAccess(id, gymId, user);
  }
}
