import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { SlotStatus } from './entities/slot.entity';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { MemberJwtGuard } from '../auth/guards/member-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload, MemberJwtPayload } from '../common/interfaces/jwt-payload.interface';

// guards are method-level: /schedule/slots/browse is member-authed,
// everything else is staff-authed (same pattern as SubscriptionsController)
@Controller('schedule')
export class ScheduleController {
  constructor(private scheduleService: ScheduleService) {}

  // ── Templates (recurring patterns) ───────────────────────────────────────

  @Post('templates')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() user: StaffJwtPayload) {
    return this.scheduleService.createTemplate(dto, user);
  }

  @Get('templates')
  @UseGuards(StaffJwtGuard)
  findAllTemplates(
    @CurrentUser() user: StaffJwtPayload,
    @Query('gym_id') gymId?: string,
    @Query('include_inactive') includeInactive?: string,
  ) {
    return this.scheduleService.findAllTemplates(user, gymId, includeInactive === 'true');
  }

  @Get('templates/:id')
  @UseGuards(StaffJwtGuard)
  findOneTemplate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.scheduleService.templateDetail(id, user);
  }

  @Patch('templates/:id')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.scheduleService.updateTemplate(id, dto, user);
  }

  @Delete('templates/:id')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  deactivateTemplate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.scheduleService.deactivateTemplate(id, user);
  }

  // ── Slots ────────────────────────────────────────────────────────────────

  @Post('slots')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  createSlot(@Body() dto: CreateSlotDto, @CurrentUser() user: StaffJwtPayload) {
    return this.scheduleService.createSlot(dto, user);
  }

  @Get('slots')
  @UseGuards(StaffJwtGuard)
  findSlots(
    @CurrentUser() user: StaffJwtPayload,
    @Query('gym_id') gymId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: SlotStatus,
    @Query('template_id') templateId?: string,
  ) {
    return this.scheduleService.findSlots(user, {
      gym_id: gymId, from, to, status, template_id: templateId,
    });
  }

  // member browse — MUST stay above 'slots/:id' so 'browse' isn't parsed as a UUID
  @Get('slots/browse')
  @UseGuards(MemberJwtGuard)
  browseSlots(
    @CurrentUser() user: MemberJwtPayload,
    @Query('gym_id') gymId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.scheduleService.browseSlots(user, gymId, from, to);
  }

  @Get('slots/:id')
  @UseGuards(StaffJwtGuard)
  findOneSlot(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.scheduleService.findOneSlot(id, user);
  }

  @Patch('slots/:id')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  updateSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSlotDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.scheduleService.updateSlot(id, dto, user);
  }

  @Patch('slots/:id/disable')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  disableSlot(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.scheduleService.disableSlot(id, user);
  }

  @Patch('slots/:id/enable')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  enableSlot(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.scheduleService.enableSlot(id, user);
  }

  @Delete('slots/:id')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  deleteSlot(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.scheduleService.deleteSlot(id, user);
  }
}
