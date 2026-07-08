import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@UseGuards(StaffJwtGuard, RolesGuard)
@Controller()
export class PlansController {
  constructor(private plansService: PlansService) {}

  // ── Plans ────────────────────────────────────────────────────────────────

  @Post('plans')
  @Roles(StaffRole.ORG_ADMIN)
  createPlan(@Body() dto: CreatePlanDto, @CurrentUser() user: StaffJwtPayload) {
    return this.plansService.createPlan(dto, user);
  }

  // any staff — front desk needs the plan list to sign members up
  @Get('plans')
  findAllPlans(
    @CurrentUser() user: StaffJwtPayload,
    @Query('gym_id') gymId?: string,
    @Query('include_archived') includeArchived?: string,
  ) {
    return this.plansService.findAllPlans(user, gymId, includeArchived === 'true');
  }

  @Get('plans/:id')
  findOnePlan(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.plansService.findOnePlan(id, user);
  }

  @Patch('plans/:id')
  @Roles(StaffRole.ORG_ADMIN)
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.plansService.updatePlan(id, dto, user);
  }

  @Delete('plans/:id')
  @Roles(StaffRole.ORG_ADMIN)
  archivePlan(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.plansService.archivePlan(id, user);
  }

  // ── Discounts ────────────────────────────────────────────────────────────

  @Post('discounts')
  @Roles(StaffRole.ORG_ADMIN)
  createDiscount(@Body() dto: CreateDiscountDto, @CurrentUser() user: StaffJwtPayload) {
    return this.plansService.createDiscount(dto, user);
  }

  @Get('discounts')
  findAllDiscounts(@CurrentUser() user: StaffJwtPayload, @Query('gym_id') gymId?: string) {
    return this.plansService.findAllDiscounts(user, gymId);
  }

  @Patch('discounts/:id')
  @Roles(StaffRole.ORG_ADMIN)
  updateDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiscountDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.plansService.updateDiscount(id, dto, user);
  }

  @Delete('discounts/:id')
  @Roles(StaffRole.ORG_ADMIN)
  deactivateDiscount(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.plansService.deactivateDiscount(id, user);
  }
}
