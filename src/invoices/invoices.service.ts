import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { Gym } from '../gym/entities/gym.entity';
import { MembershipPlan } from '../plans/entities/membership-plan.entity';
import {
  MemberSubscription, SubscriptionStatus,
} from '../subscriptions/entities/member-subscription.entity';
import { VatService } from '../vat/vat.service';
import { MailService } from '../communication/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { scopedGymIds } from '../common/utils/gym-scope';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Gym)
    private gymRepo: Repository<Gym>,
    @InjectRepository(MemberSubscription)
    private subRepo: Repository<MemberSubscription>,
    private vatService: VatService,
    private mailService: MailService,
    private notificationsService: NotificationsService,
  ) {}

  // Called by SubscriptionsService on create/renew. charge = price after discount.
  async createForSubscription(
    sub: MemberSubscription,
    plan: MembershipPlan,
    gym: Gym,
    charge: number,
    markPaid = false,
    paymentMethod?: string,
  ): Promise<Invoice> {
    const tax = this.vatService.computeTax(gym, plan, charge);
    const invoice = this.invoiceRepo.create({
      member_id: sub.member_id,
      subscription_id: sub.id,
      gym_id: gym.id,
      status: markPaid ? InvoiceStatus.PAID : InvoiceStatus.PENDING,
      amount: tax.amount,
      tax_amount: tax.tax_amount,
      tax_rate: tax.tax_rate,
      net_amount: tax.net_amount,
      currency: gym.organization?.currency ?? 'GBP',
      vat_number_snapshot: gym.vat_number, // frozen at creation
      invoice_number: await this.nextInvoiceNumber(gym.id),
      ...(markPaid ? { paid_at: new Date(), payment_method: paymentMethod ?? 'cash' } : {}),
    });
    const saved = await this.invoiceRepo.save(invoice);
    // best-effort — a new invoice must exist even if email/push both fail
    await this.notificationsService.notifyInvoiceReady(sub.member_id, gym, saved).catch(() => undefined);
    return saved;
  }

  // ponytail: count-based sequence, unique enough per gym+year; DB sequence if gyms get busy
  private async nextInvoiceNumber(gymId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.invoiceRepo.count({
      where: { gym_id: gymId, invoice_number: Like(`INV-${year}-%`) },
    });
    return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  // ── Staff reads ──────────────────────────────────────────────────────────

  async findAll(
    user: StaffJwtPayload,
    filters: { gym_id?: string; member_id?: string; status?: InvoiceStatus },
  ) {
    const scope = await scopedGymIds(user, this.gymRepo);
    if (filters.gym_id && scope && !scope.includes(filters.gym_id)) {
      throw new ForbiddenException('Access denied');
    }
    const ids = filters.gym_id ? [filters.gym_id] : scope;
    return this.invoiceRepo.find({
      where: {
        ...(ids ? { gym_id: In(ids) } : {}),
        ...(filters.member_id ? { member_id: filters.member_id } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      relations: { member: true },
      select: { member: { id: true, full_name: true, email: true } },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string, user: StaffJwtPayload): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id },
      relations: { member: true, subscription: { plan: true }, gym: true },
      select: { member: { id: true, full_name: true, email: true } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const scope = await scopedGymIds(user, this.gymRepo);
    if (scope && !scope.includes(invoice.gym_id)) throw new ForbiddenException('Access denied');
    return invoice;
  }

  // ── Member self-view ─────────────────────────────────────────────────────

  findMine(memberId: string) {
    return this.invoiceRepo.find({
      where: { member_id: memberId },
      relations: { subscription: { plan: true } },
      order: { created_at: 'DESC' },
    });
  }

  // ── Manual actions ───────────────────────────────────────────────────────

  // front desk took cash/card → mark paid; a past_due subscription re-activates
  async markPaid(id: string, paymentMethod: string | undefined, user: StaffJwtPayload) {
    const invoice = await this.findOne(id, user);
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }
    if (invoice.status === InvoiceStatus.REFUNDED) {
      throw new BadRequestException('Refunded invoices cannot be re-paid');
    }
    invoice.status = InvoiceStatus.PAID;
    invoice.paid_at = new Date();
    invoice.payment_method = paymentMethod ?? 'cash';
    const saved = await this.invoiceRepo.save(invoice);

    const sub = await this.subRepo.findOne({ where: { id: invoice.subscription_id } });
    if (sub && sub.status === SubscriptionStatus.PAST_DUE) {
      sub.status = SubscriptionStatus.ACTIVE;
      await this.subRepo.save(sub);
    }
    return saved;
  }

  async refund(id: string, user: StaffJwtPayload) {
    const invoice = await this.findOne(id, user);
    if (invoice.status !== InvoiceStatus.PAID) {
      throw new BadRequestException('Only paid invoices can be refunded');
    }
    invoice.status = InvoiceStatus.REFUNDED;
    return this.invoiceRepo.save(invoice);
  }

  async resend(id: string, user: StaffJwtPayload) {
    const invoice = await this.findOne(id, user);
    // thrown, not swallowed — an explicit "resend" must tell staff if it failed
    await this.mailService.sendInvoiceEmail(
      invoice.member.email,
      invoice.member.full_name,
      invoice,
      invoice.gym.name,
    );
    // email already confirmed sent above — this only logs it + fires push
    await this.notificationsService.logInvoiceResent(invoice.member_id, invoice.gym, invoice).catch(() => undefined);
    return { message: `Invoice ${invoice.invoice_number} sent to ${invoice.member.email}` };
  }
}
