import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { VatPeriodSummary, PeriodType } from './entities/vat-period-summary.entity';
import { Invoice, InvoiceStatus } from '../invoices/entities/invoice.entity';
import { Gym, TaxMode } from '../gym/entities/gym.entity';
import { MembershipPlan } from '../plans/entities/membership-plan.entity';
import { GenerateVatSummaryDto } from './dto/generate-vat-summary.dto';
import { scopedGymIds, assertGymAccess } from '../common/utils/gym-scope';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

export interface TaxBreakdown {
  amount: number;      // gross — what the member pays
  net_amount: number;
  tax_amount: number;
  tax_rate: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class VatService {
  constructor(
    @InjectRepository(VatPeriodSummary)
    private summaryRepo: Repository<VatPeriodSummary>,
    @InjectRepository(Invoice)
    private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Gym)
    private gymRepo: Repository<Gym>,
  ) {}

  // Tax math for one charge. tax_inclusive gyms: price already contains VAT.
  computeTax(gym: Gym, plan: MembershipPlan, charge: number): TaxBreakdown {
    const rate =
      !plan.is_vat_applicable || gym.tax_mode === TaxMode.NONE
        ? 0
        : Number(plan.vat_rate_override ?? gym.default_tax_rate);

    if (gym.tax_inclusive) {
      const amount = r2(charge);
      const net = r2(amount / (1 + rate / 100));
      return { amount, net_amount: net, tax_amount: r2(amount - net), tax_rate: rate };
    }
    const net = r2(charge);
    const tax = r2(net * (rate / 100));
    return { amount: r2(net + tax), net_amount: net, tax_amount: tax, tax_rate: rate };
  }

  // Aggregates PAID invoices for a gym+period into a stored VatPeriodSummary row
  async generateSummary(dto: GenerateVatSummaryDto, user: StaffJwtPayload): Promise<VatPeriodSummary> {
    const gym = await assertGymAccess(dto.gym_id, user, this.gymRepo);

    const start = new Date(dto.period_start);
    const end = new Date(start);
    if (dto.period_type === PeriodType.MONTHLY) end.setMonth(end.getMonth() + 1);
    else end.setMonth(end.getMonth() + 3);
    end.setDate(end.getDate() - 1); // inclusive period end

    const invoices = await this.invoiceRepo.find({
      where: {
        gym_id: dto.gym_id,
        status: InvoiceStatus.PAID,
        paid_at: Between(start, new Date(end.getTime() + 24 * 60 * 60 * 1000)),
      },
    });
    if (!invoices.length) {
      throw new BadRequestException('No paid invoices in this period — nothing to summarize');
    }

    const gross = r2(invoices.reduce((s, i) => s + Number(i.amount), 0));
    const net = r2(invoices.reduce((s, i) => s + Number(i.net_amount), 0));
    const vat = r2(invoices.reduce((s, i) => s + Number(i.tax_amount), 0));

    const summary = this.summaryRepo.create({
      gym_id: dto.gym_id,
      organization_id: gym.organization_id,
      period_start: start,
      period_end: end,
      period_type: dto.period_type,
      gross_revenue: gross,
      net_revenue: net,
      total_vat_collected: vat,
      vat_rate: Number(gym.default_tax_rate),
      invoice_count: invoices.length,
    });
    return this.summaryRepo.save(summary);
  }

  async findSummaries(user: StaffJwtPayload, gymId?: string) {
    const scope = await scopedGymIds(user, this.gymRepo);
    if (gymId && scope && !scope.includes(gymId)) throw new ForbiddenException('Access denied');
    const ids = gymId ? [gymId] : scope;
    return this.summaryRepo.find({
      where: ids ? { gym_id: In(ids) } : {},
      order: { period_start: 'DESC' },
    });
  }

  async markFiled(id: string, user: StaffJwtPayload): Promise<VatPeriodSummary> {
    const summary = await this.summaryRepo.findOne({ where: { id } });
    if (!summary) throw new NotFoundException('VAT summary not found');
    await assertGymAccess(summary.gym_id, user, this.gymRepo);
    summary.is_filed = true;
    summary.filed_at = new Date();
    return this.summaryRepo.save(summary);
  }

  // Org-level rollup is a live query across the org's gyms, not a stored record
  async orgRollup(user: StaffJwtPayload, periodStart: string, periodEnd: string) {
    if (!user.org_id) throw new BadRequestException('org_id required — use per-gym summaries as super_admin');
    const gyms = await this.gymRepo.find({
      where: { organization_id: user.org_id },
      select: { id: true, name: true },
    });
    if (!gyms.length) return { gyms: [], totals: { gross_revenue: 0, net_revenue: 0, total_vat_collected: 0, invoice_count: 0 } };

    const rows = await this.invoiceRepo
      .createQueryBuilder('i')
      .select('i.gym_id', 'gym_id')
      .addSelect('COALESCE(SUM(i.amount), 0)', 'gross_revenue')
      .addSelect('COALESCE(SUM(i.net_amount), 0)', 'net_revenue')
      .addSelect('COALESCE(SUM(i.tax_amount), 0)', 'total_vat_collected')
      .addSelect('COUNT(*)', 'invoice_count')
      .where('i.gym_id IN (:...ids)', { ids: gyms.map((g) => g.id) })
      .andWhere('i.status = :status', { status: InvoiceStatus.PAID })
      .andWhere('i.paid_at >= :start AND i.paid_at < :end', {
        start: periodStart,
        end: new Date(new Date(periodEnd).getTime() + 24 * 60 * 60 * 1000),
      })
      .groupBy('i.gym_id')
      .getRawMany();

    const byGym = gyms.map((g) => {
      const r = rows.find((x) => x.gym_id === g.id);
      return {
        gym_id: g.id,
        gym_name: g.name,
        gross_revenue: r2(Number(r?.gross_revenue ?? 0)),
        net_revenue: r2(Number(r?.net_revenue ?? 0)),
        total_vat_collected: r2(Number(r?.total_vat_collected ?? 0)),
        invoice_count: Number(r?.invoice_count ?? 0),
      };
    });
    const totals = byGym.reduce(
      (t, g) => ({
        gross_revenue: r2(t.gross_revenue + g.gross_revenue),
        net_revenue: r2(t.net_revenue + g.net_revenue),
        total_vat_collected: r2(t.total_vat_collected + g.total_vat_collected),
        invoice_count: t.invoice_count + g.invoice_count,
      }),
      { gross_revenue: 0, net_revenue: 0, total_vat_collected: 0, invoice_count: 0 },
    );
    return { period_start: periodStart, period_end: periodEnd, gyms: byGym, totals };
  }
}
