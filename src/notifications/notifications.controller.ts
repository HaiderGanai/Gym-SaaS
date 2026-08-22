import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { RegisterWebPushSubscriptionDto } from './dto/register-web-push-subscription.dto';
import { TestPushDto } from './dto/test-push.dto';
import { BroadcastDto } from './dto/broadcast.dto';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { MemberJwtGuard } from '../auth/guards/member-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { MemberJwtPayload, StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

// member-facing in-app notification inbox + device-token registration
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @UseGuards(MemberJwtGuard)
  list(@CurrentUser() user: MemberJwtPayload, @Query('unread_only') unreadOnly?: string) {
    return this.notificationsService.listForMember(user, unreadOnly === 'true');
  }

  @Get('unread-count')
  @UseGuards(MemberJwtGuard)
  unreadCount(@CurrentUser() user: MemberJwtPayload) {
    return this.notificationsService.unreadCount(user);
  }

  @Patch('read-all')
  @UseGuards(MemberJwtGuard)
  markAllRead(@CurrentUser() user: MemberJwtPayload) {
    return this.notificationsService.markAllRead(user);
  }

  @Patch(':id/read')
  @UseGuards(MemberJwtGuard)
  markRead(@Param('id') id: string, @CurrentUser() user: MemberJwtPayload) {
    return this.notificationsService.markRead(id, user);
  }

  @Post('device-token')
  @UseGuards(MemberJwtGuard)
  registerToken(@Body() dto: RegisterDeviceTokenDto, @CurrentUser() user: MemberJwtPayload) {
    return this.notificationsService.registerDeviceToken(user, dto.fcm_token);
  }

  @Delete('device-token')
  @UseGuards(MemberJwtGuard)
  clearToken(@CurrentUser() user: MemberJwtPayload) {
    return this.notificationsService.clearDeviceToken(user);
  }

  @Post('web-push-subscription')
  @UseGuards(MemberJwtGuard)
  registerWebPushSubscription(
    @Body() dto: RegisterWebPushSubscriptionDto, @CurrentUser() user: MemberJwtPayload,
  ) {
    return this.notificationsService.registerWebPushSubscription(user, dto);
  }

  @Delete('web-push-subscription')
  @UseGuards(MemberJwtGuard)
  clearWebPushSubscription(@CurrentUser() user: MemberJwtPayload) {
    return this.notificationsService.clearWebPushSubscription(user);
  }

  // manual test — fires a canned notification through every channel the
  // logged-in member has registered, so wiring can be verified without
  // triggering a real booking/cancel/announcement flow
  @Post('test-push')
  @UseGuards(MemberJwtGuard)
  testPush(@Body() dto: TestPushDto, @CurrentUser() user: MemberJwtPayload) {
    return this.notificationsService.sendTestPush(user, dto.title, dto.body);
  }
}

// staff-facing composer: send an announcement to a gym's members
@Controller('communication')
export class CommunicationController {
  constructor(private notificationsService: NotificationsService) {}

  @Post('broadcast')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  broadcast(@Body() dto: BroadcastDto, @CurrentUser() user: StaffJwtPayload) {
    return this.notificationsService.broadcastAnnouncement(user, dto);
  }
}
