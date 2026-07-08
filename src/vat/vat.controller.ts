import {
  Controller, Get, Post, Patch,
  Param, Body, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { VatService } from './vat.service';
import { GenerateVatSummaryDto } from './dto/generate-vat-summary.dto';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@UseGuards(StaffJwtGuard, RolesGuard)
@Controller('vat')
export class VatController {
  constructor(private vatService: VatService) {}

  @Post('summaries')
  @Roles(StaffRole.ORG_ADMIN)
  generate(@Body() dto: GenerateVatSummaryDto, @CurrentUser() user: StaffJwtPayload) {
    return this.vatService.generateSummary(dto, user);
  }

  @Get('summaries')
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  findAll(@CurrentUser() user: StaffJwtPayload, @Query('gym_id') gymId?: string) {
    return this.vatService.findSummaries(user, gymId);
  }

  @Patch('summaries/:id/file')
  @Roles(StaffRole.ORG_ADMIN)
  markFiled(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.vatService.markFiled(id, user);
  }

  // live org-wide rollup — not stored
  @Get('org-rollup')
  @Roles(StaffRole.ORG_ADMIN)
  orgRollup(
    @CurrentUser() user: StaffJwtPayload,
    @Query('period_start') periodStart: string,
    @Query('period_end') periodEnd: string,
  ) {
    return this.vatService.orgRollup(user, periodStart, periodEnd);
  }
}
