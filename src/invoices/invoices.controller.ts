import {
  Controller, Get, Post, Patch,
  Param, Body, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { InvoiceStatus } from './entities/invoice.entity';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { MemberJwtGuard } from '../auth/guards/member-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload, MemberJwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  // member views own invoice history — must be declared before :id
  @Get('me')
  @UseGuards(MemberJwtGuard)
  findMine(@CurrentUser() user: MemberJwtPayload) {
    return this.invoicesService.findMine(user.sub);
  }

  @Get()
  @UseGuards(StaffJwtGuard)
  findAll(
    @CurrentUser() user: StaffJwtPayload,
    @Query('gym_id') gymId?: string,
    @Query('member_id') memberId?: string,
    @Query('status') status?: InvoiceStatus,
  ) {
    return this.invoicesService.findAll(user, { gym_id: gymId, member_id: memberId, status });
  }

  @Get(':id')
  @UseGuards(StaffJwtGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.invoicesService.findOne(id, user);
  }

  // manual billing: front desk collects cash/card and marks the invoice paid
  @Patch(':id/pay')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER, StaffRole.FRONT_DESK)
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaidDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.invoicesService.markPaid(id, dto.payment_method, user);
  }

  @Patch(':id/refund')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN)
  refund(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.invoicesService.refund(id, user);
  }

  @Post(':id/resend')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER, StaffRole.FRONT_DESK)
  resend(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.invoicesService.resend(id, user);
  }
}
