import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards, Req, Headers, ParseUUIDPipe,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PlatformBillingService } from './platform-billing.service';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipSubscriptionCheck } from '../common/decorators/skip-subscription.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateQuantityDto } from './dto/update-quantity.dto';
import { AttachPaymentMethodDto } from './dto/attach-payment-method.dto';
import { AdminUpdateSubscriptionDto } from './dto/admin-update-subscription.dto';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@SkipSubscriptionCheck() // billing must stay reachable for pending/expired orgs so they can pay
@Controller('platform')
export class PlatformBillingController {
  constructor(private billing: PlatformBillingService) {}

  // ── Plans ────────────────────────────────────────────────────────────────────

  @Public()
  @Get('plans')
  listPlans() {
    return this.billing.listPlans();
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.SUPER_ADMIN)
  @Get('plans/all')
  listAllPlans() {
    return this.billing.listAllPlans();
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.SUPER_ADMIN)
  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.billing.createPlan(dto);
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.SUPER_ADMIN)
  @Patch('plans/:id')
  updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return this.billing.updatePlan(id, dto);
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.SUPER_ADMIN)
  @Delete('plans/:id')
  deactivatePlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.deactivatePlan(id);
  }

  // ── Checkout & subscription (org_admin) ──────────────────────────────────────

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN)
  @Post('billing/checkout')
  checkout(@CurrentUser() user: StaffJwtPayload, @Body() dto: CheckoutDto) {
    return this.billing.createCheckout(user, dto);
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN)
  @Get('billing/subscription')
  mySubscription(@CurrentUser() user: StaffJwtPayload) {
    return this.billing.getMySubscription(user);
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN)
  @Post('billing/quantity')
  updateQuantity(@CurrentUser() user: StaffJwtPayload, @Body() dto: UpdateQuantityDto) {
    return this.billing.updateQuantity(user, dto);
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN)
  @Post('billing/cancel')
  cancel(@CurrentUser() user: StaffJwtPayload) {
    return this.billing.cancelSubscription(user);
  }

  // ── Payment methods (org_admin) ──────────────────────────────────────────────

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN)
  @Get('billing/payment-methods')
  listPaymentMethods(@CurrentUser() user: StaffJwtPayload) {
    return this.billing.listPaymentMethods(user);
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN)
  @Post('billing/payment-methods')
  attachPaymentMethod(@CurrentUser() user: StaffJwtPayload, @Body() dto: AttachPaymentMethodDto) {
    return this.billing.attachPaymentMethod(user, dto);
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN)
  @Patch('billing/payment-methods/:id/default')
  setDefaultPaymentMethod(@CurrentUser() user: StaffJwtPayload, @Param('id') id: string) {
    return this.billing.setDefaultPaymentMethod(user, id);
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN)
  @Delete('billing/payment-methods/:id')
  detachPaymentMethod(@CurrentUser() user: StaffJwtPayload, @Param('id') id: string) {
    return this.billing.detachPaymentMethod(user, id);
  }

  // ── Stripe webhook (public, signature-verified) ──────────────────────────────

  @Public()
  @Post('billing/webhook')
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    return this.billing.handleWebhook(req.rawBody!, signature);
  }

  // ── Super admin ──────────────────────────────────────────────────────────────

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.SUPER_ADMIN)
  @Get('subscriptions')
  listAllSubscriptions() {
    return this.billing.listAllSubscriptions();
  }

  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.SUPER_ADMIN)
  @Patch('subscriptions/:id')
  adminUpdateSubscription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateSubscriptionDto,
  ) {
    return this.billing.adminUpdateSubscription(id, dto);
  }
}
