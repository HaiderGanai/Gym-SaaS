import {
  Controller, Get, Post, Patch,
  Param, Body, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { SubscriptionStatus } from './entities/member-subscription.entity';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { MemberJwtGuard } from '../auth/guards/member-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload, MemberJwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private subsService: SubscriptionsService) {}

  // member views own subscriptions — must be declared before :id
  @Get('me')
  @UseGuards(MemberJwtGuard)
  findMine(@CurrentUser() user: MemberJwtPayload) {
    return this.subsService.findMine(user.sub);
  }

  @Post()
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER, StaffRole.FRONT_DESK)
  create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: StaffJwtPayload) {
    return this.subsService.create(dto, user);
  }

  @Get()
  @UseGuards(StaffJwtGuard)
  findAll(
    @CurrentUser() user: StaffJwtPayload,
    @Query('gym_id') gymId?: string,
    @Query('member_id') memberId?: string,
    @Query('status') status?: SubscriptionStatus,
  ) {
    return this.subsService.findAll(user, { gym_id: gymId, member_id: memberId, status });
  }

  @Get(':id')
  @UseGuards(StaffJwtGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.subsService.findOne(id, user);
  }

  @Post(':id/renew')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER, StaffRole.FRONT_DESK)
  renew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenewSubscriptionDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.subsService.renew(id, dto, user);
  }

  @Patch(':id/pause')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  pause(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.subsService.pause(id, user);
  }

  @Patch(':id/resume')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.subsService.resume(id, user);
  }

  @Patch(':id/cancel')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.subsService.cancel(id, user);
  }
}
