import {
  Controller, Get, Post, Patch,
  Param, Body, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CheckinDto } from './dto/checkin.dto';
import { BookingStatus } from './entities/booking.entity';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { MemberJwtGuard } from '../auth/guards/member-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload, MemberJwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('bookings')
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  @Post()
  @UseGuards(MemberJwtGuard)
  book(@Body() dto: CreateBookingDto, @CurrentUser() user: MemberJwtPayload) {
    return this.bookingsService.book(dto, user);
  }

  @Get('me')
  @UseGuards(MemberJwtGuard)
  myBookings(@CurrentUser() user: MemberJwtPayload, @Query('include_past') includePast?: string) {
    return this.bookingsService.myBookings(user, includePast === 'true');
  }

  // any staff role can operate bookings at their gyms — front desk included;
  // gym scoping happens in the service, so no RolesGuard here
  @Get()
  @UseGuards(StaffJwtGuard)
  list(
    @CurrentUser() user: StaffJwtPayload,
    @Query('gym_id') gymId?: string,
    @Query('slot_id') slotId?: string,
    @Query('member_id') memberId?: string,
    @Query('status') status?: BookingStatus,
  ) {
    return this.bookingsService.list(user, { gym_id: gymId, slot_id: slotId, member_id: memberId, status });
  }

  @Patch(':id/cancel')
  @UseGuards(MemberJwtGuard)
  cancelOwn(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: MemberJwtPayload) {
    return this.bookingsService.cancelOwn(id, user);
  }

  // staff cancellation ignores the cutoff (member phoned in, emergencies)
  @Patch(':id/staff-cancel')
  @UseGuards(StaffJwtGuard)
  staffCancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.bookingsService.staffCancel(id, user);
  }

  @Patch(':id/no-show')
  @UseGuards(StaffJwtGuard)
  markNoShow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.bookingsService.markNoShow(id, user);
  }
}

// front-desk scanner endpoints — always 200 with an allowed flag, so the
// scanner UI shows green/red instead of handling HTTP errors
@Controller('checkin')
export class CheckinController {
  constructor(private bookingsService: BookingsService) {}

  @Post('entry')
  @UseGuards(StaffJwtGuard)
  entry(@Body() dto: CheckinDto, @CurrentUser() user: StaffJwtPayload) {
    return this.bookingsService.checkinEntry(dto.qr_token, user);
  }

  @Post('booking')
  @UseGuards(StaffJwtGuard)
  booking(@Body() dto: CheckinDto, @CurrentUser() user: StaffJwtPayload) {
    return this.bookingsService.checkinBooking(dto.qr_token, user);
  }
}

// lives here (not MembersModule) because it is subscription+QR logic
@Controller('members/me')
export class EntryQrController {
  constructor(private bookingsService: BookingsService) {}

  @Get('entry-qr')
  @UseGuards(MemberJwtGuard)
  entryQr(@CurrentUser() user: MemberJwtPayload, @Query('gym_id') gymId?: string) {
    return this.bookingsService.entryQr(user, gymId);
  }
}

// staff-facing: fetch the gym's printable static entry QR
@Controller('gyms')
export class GymQrController {
  constructor(private bookingsService: BookingsService) {}

  @Get(':id/qr')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  gymQr(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.bookingsService.gymQr(id, user);
  }
}
