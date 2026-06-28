import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { StaffService } from './staff.service';
import { InviteStaffDto } from './dto/invite-staff.dto';
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
  @Roles(StaffRole.ORG_OWNER, StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  inviteStaff(
    @Body() dto: InviteStaffDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.staffService.inviteStaff(dto, user.org_id);
  }
}
