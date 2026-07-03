import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import Stripe from 'stripe';
import { PlatformPlan, PlanInterval } from './entities/platform-plan.entity';
import { OrgSubscription } from './entities/org-subscription.entity';
import { SubscriptionStatus } from './entities/subscription-status.enum';
import { Organization } from '../organization/entities/organization.entity';
import { StaffUser, StaffRole } from '../staff/entities/staff-user.entity';
import { Gym } from '../gym/entities/gym.entity';
import { MailService } from '../communication/mail.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateQuantityDto } from './dto/update-quantity.dto';
import { AttachPaymentMethodDto } from './dto/attach-payment-method.dto';
import { AdminUpdateSubscriptionDto } from './dto/admin-update-subscription.dto';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

const GRACE_DAYS = 3;

const STRIPE_RECURRING: Record<PlanInterval, Stripe.PriceCreateParams.Recurring> = {
  [PlanInterval.MONTHLY]: { interval: 'month' },
  [PlanInterval.QUARTERLY]: { interval: 'month', interval_count: 3 },
  [PlanInterval.YEARLY]: { interval: 'year' },
};

@Injectable()
export class PlatformBillingService {
  private readonly logger = new Logger(PlatformBillingService.name);
  private stripe: Stripe;

  constructor(
    private config: ConfigService,
    private mail: MailService,
    @InjectRepository(PlatformPlan) private planRepo: Repository<PlatformPlan>,
    @InjectRepository(OrgSubscription) private subRepo: Repository<OrgSubscription>,
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
    @InjectRepository(StaffUser) private staffRepo: Repository<StaffUser>,
    @InjectRepository(Gym) private gymRepo: Repository<Gym>,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY') ?? 'sk_test_placeholder');
  }

  // ── Plans ────────────────────────────────────────────────────────────────────

  listPlans(): Promise<PlatformPlan[]> {
    return this.planRepo.find({ where: { is_active: true }, order: { price_per_branch: 'ASC' } });
  }

  listAllPlans(): Promise<PlatformPlan[]> {
    return this.planRepo.find({ order: { created_at: 'DESC' } });
  }

  async createPlan(dto: CreatePlanDto): Promise<PlatformPlan> {
    const currency = (dto.currency ?? 'GBP').toLowerCase();
    const product = await this.stripe.products.create({ name: dto.name });
    const price = await this.stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(dto.price_per_branch * 100),
      currency,
      recurring: STRIPE_RECURRING[dto.interval],
    });
    const plan = this.planRepo.create({
      name: dto.name,
      interval: dto.interval,
      price_per_branch: dto.price_per_branch.toFixed(2),
      currency: currency.toUpperCase(),
      stripe_product_id: product.id,
      stripe_price_id: price.id,
    });
    return this.planRepo.save(plan);
  }

  async updatePlan(id: string, dto: UpdatePlanDto): Promise<PlatformPlan> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');

    if (dto.name && dto.name !== plan.name) {
      await this.stripe.products.update(plan.stripe_product_id, { name: dto.name });
      plan.name = dto.name;
    }
    if (dto.price_per_branch !== undefined) {
      // Stripe prices are immutable — create a new one, archive the old.
      // Existing subscriptions stay on the old price; new checkouts use the new one.
      const newPrice = await this.stripe.prices.create({
        product: plan.stripe_product_id,
        unit_amount: Math.round(dto.price_per_branch * 100),
        currency: plan.currency.toLowerCase(),
        recurring: STRIPE_RECURRING[plan.interval],
      });
      await this.stripe.prices.update(plan.stripe_price_id, { active: false });
      plan.stripe_price_id = newPrice.id;
      plan.price_per_branch = dto.price_per_branch.toFixed(2);
    }
    if (dto.is_active !== undefined) plan.is_active = dto.is_active;
    return this.planRepo.save(plan);
  }

  async deactivatePlan(id: string): Promise<{ message: string }> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    await this.stripe.prices.update(plan.stripe_price_id, { active: false });
    plan.is_active = false;
    await this.planRepo.save(plan);
    return { message: 'Plan deactivated. Existing subscribers are unaffected.' };
  }

  // ── Checkout & subscription (org_admin) ──────────────────────────────────────

  async createCheckout(user: StaffJwtPayload, dto: CheckoutDto): Promise<{ checkout_url: string }> {
    const org = await this.requireOrg(user);
    const plan = await this.planRepo.findOne({ where: { id: dto.plan_id, is_active: true } });
    if (!plan) throw new NotFoundException('Plan not found or inactive');

    const existing = await this.latestSub(org.id);
    if (existing && [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE].includes(existing.status)) {
      throw new BadRequestException('Organization already has an active subscription');
    }

    const customerId = await this.ensureCustomer(org, user.email);
    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripe_price_id, quantity: dto.branch_count }],
      success_url: `${frontend}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/billing/cancelled`,
      metadata: { organization_id: org.id, plan_id: plan.id, branch_count: String(dto.branch_count) },
      subscription_data: { metadata: { organization_id: org.id, plan_id: plan.id } },
    });

    // pending row now; webhook flips it to active on payment
    if (existing && existing.status === SubscriptionStatus.PENDING) {
      existing.plan_id = plan.id;
      existing.branch_count = dto.branch_count;
      await this.subRepo.save(existing);
    } else {
      await this.subRepo.save(this.subRepo.create({
        organization_id: org.id,
        plan_id: plan.id,
        branch_count: dto.branch_count,
        status: SubscriptionStatus.PENDING,
      }));
    }

    return { checkout_url: session.url! };
  }

  async getMySubscription(user: StaffJwtPayload) {
    const org = await this.requireOrg(user);
    const sub = await this.subRepo.findOne({
      where: { organization_id: org.id },
      relations: { plan: true },
      order: { created_at: 'DESC' },
    });
    if (!sub) return { status: 'none', message: 'No subscription yet — pick a plan and checkout.' };
    return sub;
  }

  async updateQuantity(user: StaffJwtPayload, dto: UpdateQuantityDto): Promise<OrgSubscription> {
    const org = await this.requireOrg(user);
    const sub = await this.latestSub(org.id);
    if (!sub?.stripe_subscription_id || ![SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE].includes(sub.status)) {
      throw new BadRequestException('No active subscription to update');
    }
    const gymCount = await this.gymRepo.count({ where: { organization_id: org.id } });
    if (dto.branch_count < gymCount) {
      throw new BadRequestException(`You have ${gymCount} branches — delete branches before reducing below that.`);
    }
    const stripeSub = await this.stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    await this.stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: stripeSub.items.data[0].id, quantity: dto.branch_count }],
      proration_behavior: 'create_prorations',
    });
    sub.branch_count = dto.branch_count;
    return this.subRepo.save(sub);
  }

  async cancelSubscription(user: StaffJwtPayload): Promise<{ message: string }> {
    const org = await this.requireOrg(user);
    const sub = await this.latestSub(org.id);
    if (!sub?.stripe_subscription_id) throw new NotFoundException('No subscription found');
    await this.stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
    sub.cancel_at_period_end = true;
    await this.subRepo.save(sub);
    return { message: 'Subscription will cancel at the end of the current period.' };
  }

  // ── Payment methods (org_admin) ──────────────────────────────────────────────

  async listPaymentMethods(user: StaffJwtPayload) {
    const org = await this.requireOrg(user);
    if (!org.stripe_customer_id) return [];
    const [methods, customer] = await Promise.all([
      this.stripe.paymentMethods.list({ customer: org.stripe_customer_id, type: 'card' }),
      this.stripe.customers.retrieve(org.stripe_customer_id) as Promise<Stripe.Customer>,
    ]);
    const defaultId = customer.invoice_settings?.default_payment_method;
    return methods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      exp_month: pm.card?.exp_month,
      exp_year: pm.card?.exp_year,
      is_default: pm.id === defaultId,
    }));
  }

  async attachPaymentMethod(user: StaffJwtPayload, dto: AttachPaymentMethodDto) {
    const org = await this.requireOrg(user);
    const customerId = await this.ensureCustomer(org, user.email);
    const pm = await this.stripe.paymentMethods.attach(dto.payment_method_id, { customer: customerId });
    if (dto.set_default) {
      await this.stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: pm.id },
      });
    }
    return { id: pm.id, brand: pm.card?.brand, last4: pm.card?.last4, is_default: !!dto.set_default };
  }

  async setDefaultPaymentMethod(user: StaffJwtPayload, pmId: string) {
    const org = await this.requireOrg(user);
    if (!org.stripe_customer_id) throw new NotFoundException('No Stripe customer for this organization');
    await this.stripe.customers.update(org.stripe_customer_id, {
      invoice_settings: { default_payment_method: pmId },
    });
    return { message: 'Default payment method updated.' };
  }

  async detachPaymentMethod(user: StaffJwtPayload, pmId: string) {
    const org = await this.requireOrg(user);
    if (!org.stripe_customer_id) throw new NotFoundException('No Stripe customer for this organization');
    // make sure the card belongs to this org's customer, not someone else's
    const pm = await this.stripe.paymentMethods.retrieve(pmId);
    if (pm.customer !== org.stripe_customer_id) throw new ForbiddenException('Payment method does not belong to your organization');
    await this.stripe.paymentMethods.detach(pmId);
    return { message: 'Payment method removed.' };
  }

  // ── Webhook ──────────────────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody, signature, this.config.get<string>('STRIPE_WEBHOOK_SECRET')!,
      );
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.paid':
        await this.onInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.onInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        this.logger.debug(`Unhandled webhook event: ${event.type}`);
    }
    return { received: true };
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const orgId = session.metadata?.organization_id;
    if (!orgId) return;
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) return;

    const stripeSubId = session.subscription as string;
    const stripeSub = await this.stripe.subscriptions.retrieve(stripeSubId);

    let sub = await this.latestSub(orgId);
    if (!sub) {
      sub = this.subRepo.create({
        organization_id: orgId,
        plan_id: session.metadata!.plan_id,
        branch_count: Number(session.metadata?.branch_count ?? 1),
      });
    }
    sub.stripe_subscription_id = stripeSubId;
    sub.status = SubscriptionStatus.ACTIVE;
    sub.current_period_end = this.periodEnd(stripeSub);
    sub.grace_ends_at = null;
    await this.subRepo.save(sub);

    org.stripe_customer_id = session.customer as string;
    org.subscription_status = SubscriptionStatus.ACTIVE;
    await this.orgRepo.save(org);
    this.logger.log(`Org ${org.name} subscription activated`);
  }

  private async onInvoicePaid(invoice: Stripe.Invoice) {
    const sub = await this.subByStripeId(this.invoiceSubId(invoice));
    if (!sub) return;
    const stripeSub = await this.stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    sub.status = SubscriptionStatus.ACTIVE;
    sub.current_period_end = this.periodEnd(stripeSub);
    sub.grace_ends_at = null;
    await this.subRepo.save(sub);
    await this.syncOrgStatus(sub.organization_id, SubscriptionStatus.ACTIVE);
  }

  private async onInvoiceFailed(invoice: Stripe.Invoice) {
    const sub = await this.subByStripeId(this.invoiceSubId(invoice));
    if (!sub || sub.status === SubscriptionStatus.GRACE) return;
    sub.status = SubscriptionStatus.GRACE;
    sub.grace_ends_at = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    await this.subRepo.save(sub);
    await this.syncOrgStatus(sub.organization_id, SubscriptionStatus.GRACE);
    await this.notifyOrgAdmins(sub.organization_id, GRACE_DAYS);
  }

  private async onSubscriptionUpdated(stripeSub: Stripe.Subscription) {
    const sub = await this.subByStripeId(stripeSub.id);
    if (!sub) return;
    sub.current_period_end = this.periodEnd(stripeSub);
    sub.cancel_at_period_end = stripeSub.cancel_at_period_end;
    const qty = stripeSub.items.data[0]?.quantity;
    if (qty) sub.branch_count = qty;
    await this.subRepo.save(sub);
  }

  private async onSubscriptionDeleted(stripeSub: Stripe.Subscription) {
    const sub = await this.subByStripeId(stripeSub.id);
    if (!sub) return;
    sub.status = SubscriptionStatus.CANCELLED;
    await this.subRepo.save(sub);
    await this.syncOrgStatus(sub.organization_id, SubscriptionStatus.CANCELLED);
  }

  // ── Super admin ──────────────────────────────────────────────────────────────

  listAllSubscriptions(): Promise<OrgSubscription[]> {
    return this.subRepo.find({
      relations: { organization: true, plan: true },
      order: { created_at: 'DESC' },
    });
  }

  async adminUpdateSubscription(id: string, dto: AdminUpdateSubscriptionDto): Promise<OrgSubscription> {
    const sub = await this.subRepo.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (dto.extend_days) {
      const base = sub.current_period_end && sub.current_period_end > new Date()
        ? sub.current_period_end : new Date();
      sub.current_period_end = new Date(base.getTime() + dto.extend_days * 24 * 60 * 60 * 1000);
      sub.status = SubscriptionStatus.ACTIVE;
      sub.grace_ends_at = null;
    }
    if (dto.status) sub.status = dto.status;
    await this.subRepo.save(sub);
    await this.syncOrgStatus(sub.organization_id, sub.status);
    return sub;
  }

  // ── Grace-period cron (daily 9:00) ───────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async graceCron() {
    const now = new Date();

    // safety net: active subs whose period lapsed without a webhook → grace
    const lapsed = await this.subRepo.find({
      where: { status: SubscriptionStatus.ACTIVE, current_period_end: LessThan(now) },
    });
    for (const sub of lapsed) {
      sub.status = SubscriptionStatus.GRACE;
      sub.grace_ends_at = new Date(sub.current_period_end!.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
      await this.subRepo.save(sub);
      await this.syncOrgStatus(sub.organization_id, SubscriptionStatus.GRACE);
    }

    // grace subs: expire or send the daily reminder
    const inGrace = await this.subRepo.find({ where: { status: SubscriptionStatus.GRACE } });
    for (const sub of inGrace) {
      if (sub.grace_ends_at && sub.grace_ends_at < now) {
        sub.status = SubscriptionStatus.EXPIRED;
        await this.subRepo.save(sub);
        await this.syncOrgStatus(sub.organization_id, SubscriptionStatus.EXPIRED);
        await this.notifyOrgAdmins(sub.organization_id, 0);
      } else {
        const daysLeft = sub.grace_ends_at
          ? Math.max(1, Math.ceil((sub.grace_ends_at.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
          : GRACE_DAYS;
        await this.notifyOrgAdmins(sub.organization_id, daysLeft);
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async requireOrg(user: StaffJwtPayload): Promise<Organization> {
    if (!user.org_id) throw new ForbiddenException('This endpoint requires an organization account');
    const org = await this.orgRepo.findOne({ where: { id: user.org_id } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  private latestSub(orgId: string): Promise<OrgSubscription | null> {
    return this.subRepo.findOne({ where: { organization_id: orgId }, order: { created_at: 'DESC' } });
  }

  private async subByStripeId(stripeSubId: string | null): Promise<OrgSubscription | null> {
    if (!stripeSubId) return null;
    return this.subRepo.findOne({ where: { stripe_subscription_id: stripeSubId } });
  }

  private async ensureCustomer(org: Organization, email: string): Promise<string> {
    if (org.stripe_customer_id) return org.stripe_customer_id;
    const customer = await this.stripe.customers.create({
      name: org.name,
      email,
      metadata: { organization_id: org.id },
    });
    org.stripe_customer_id = customer.id;
    await this.orgRepo.save(org);
    return customer.id;
  }

  private async syncOrgStatus(orgId: string, status: SubscriptionStatus) {
    await this.orgRepo.update({ id: orgId }, { subscription_status: status });
  }

  // ponytail: Stripe API ≥2025-03 moved current_period_end onto subscription items;
  // older versions keep it on the subscription — read both.
  private periodEnd(sub: Stripe.Subscription): Date {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const ts = (sub as any).current_period_end ?? (sub as any).items?.data?.[0]?.current_period_end;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return new Date(ts * 1000);
  }

  // same story: invoice.subscription moved to invoice.parent.subscription_details
  private invoiceSubId(invoice: Stripe.Invoice): string | null {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const raw = (invoice as any).subscription
      ?? (invoice as any).parent?.subscription_details?.subscription;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return typeof raw === 'string' ? raw : raw?.id ?? null;
  }

  private async notifyOrgAdmins(orgId: string, daysLeft: number) {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) return;
    const admins = await this.staffRepo.find({
      where: { organization_id: orgId, role: StaffRole.ORG_ADMIN, is_active: true },
    });
    for (const admin of admins) {
      try {
        await this.mail.sendSubscriptionReminder(admin.email, org.name, daysLeft);
      } catch {
        // already logged inside MailService — one bad address must not stop the cron
      }
    }
  }
}
