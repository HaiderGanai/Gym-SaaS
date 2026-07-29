import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@UseGuards(StaffJwtGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  // live per-gym stats — not stored
  @Get('gyms/:gymId/stats')
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  gymStats(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @CurrentUser() user: StaffJwtPayload,
    @Query('period_start') periodStart: string,
    @Query('period_end') periodEnd: string,
  ) {
    return this.reportsService.gymStats(gymId, user, periodStart, periodEnd);
  }

  // live org-wide rollup + per-gym breakdown — not stored
  @Get('org/stats')
  @Roles(StaffRole.ORG_ADMIN)
  orgStats(
    @CurrentUser() user: StaffJwtPayload,
    @Query('period_start') periodStart: string,
    @Query('period_end') periodEnd: string,
  ) {
    return this.reportsService.orgStats(user, periodStart, periodEnd);
  }
}
