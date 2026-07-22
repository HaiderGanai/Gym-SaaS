import {
  Injectable, Logger, NotFoundException, ConflictException,
  ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SlotTemplate } from './entities/slot-template.entity';
import { Slot, SlotStatus } from './entities/slot.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';
import { Gym } from '../gym/entities/gym.entity';
import { StaffUser } from '../staff/entities/staff-user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { expandRrule } from './rrule.util';
import { scopedGymIds, assertGymAccess } from '../common/utils/gym-scope';
import type { StaffJwtPayload, MemberJwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { GenerateSlotsDto } from './dto/generate-slots.dto';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';

const HORIZON_DAYS = 30; // rolling window of materialized slots
const MAX_GENERATE_DAYS = 366;

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    @InjectRepository(SlotTemplate) private templateRepo: Repository<SlotTemplate>,
    @InjectRepository(Slot) private slotRepo: Repository<Slot>,
    @InjectRepository(Booking) private bookingRepo: Repository<Booking>,
    @InjectRepository(Gym) private gymRepo: Repository<Gym>,
    @InjectRepository(StaffUser) private staffRepo: Repository<StaffUser>,
    private notificationsService: NotificationsService,
  ) {}

  // ── Templates ────────────────────────────────────────────────────────────

  async createTemplate(dto: CreateTemplateDto, user: StaffJwtPayload) {
    const gym = await assertGymAccess(dto.gym_id, user, this.gymRepo);
    await this.assertInstructor(dto.instructor_id, gym);

    const until = this.resolveUntil(dto.generate_until);
    expandRrule(dto.rrule, new Date(), until); // validates the rule up front

    const { generate_until, ...fields } = dto;
    const template = await this.templateRepo.save(this.templateRepo.create(fields));
    const result = await this.materialize(template, new Date(), until);
    return { template, ...result, ...(await this.window(template.id)) };
  }

  async findAllTemplates(user: StaffJwtPayload, gymId?: string, includeInactive = false) {
    const ids = await this.gymFilter(user, gymId);
    const templates = await this.templateRepo.find({
      where: {
        ...(ids ? { gym_id: In(ids) } : {}),
        ...(includeInactive ? {} : { is_active: true }),
      },
      relations: { instructor: true },
      select: { instructor: { id: true, email: true } },
      order: { created_at: 'DESC' },
    });
    const windows = await this.windows(templates.map((t) => t.id));
    return templates.map((t) => ({ ...t, ...windows.get(t.id) }));
  }

  // single template + its materialized-window info (client-facing GET :id)
  async templateDetail(id: string, user: StaffJwtPayload) {
    const template = await this.findOneTemplate(id, user);
    return { ...template, ...(await this.window(id)) };
  }

  async findOneTemplate(id: string, user: StaffJwtPayload): Promise<SlotTemplate> {
    const template = await this.templateRepo.findOne({
      where: { id },
      relations: { instructor: true },
      select: { instructor: { id: true, email: true } },
    });
    if (!template) throw new NotFoundException('Template not found');
    await assertGymAccess(template.gym_id, user, this.gymRepo);
    return template;
  }

  // apply_to_future = "all future occurrences"; otherwise only the template changes
  async updateTemplate(id: string, dto: UpdateTemplateDto, user: StaffJwtPayload) {
    const template = await this.findOneTemplate(id, user);
    const gym = await this.gymRepo.findOneByOrFail({ id: template.gym_id });
    if (dto.instructor_id) await this.assertInstructor(dto.instructor_id, gym);

    const rebuild =
      (dto.rrule && dto.rrule !== template.rrule) ||
      (dto.duration_minutes && dto.duration_minutes !== template.duration_minutes);

    const { apply_to_future, ...fields } = dto;
    Object.assign(template, fields);
    if (dto.rrule) expandRrule(dto.rrule, new Date(), this.resolveUntil()); // validate
    const saved = await this.templateRepo.save(template);

    if (!apply_to_future) return { template: saved };

    if (rebuild) {
      // timing changed: drop future empty slots, keep booked ones, regenerate
      const { affected } = await this.slotRepo.delete({
        template_id: id, booking_count: 0, starts_at: MoreThan(new Date()),
      });
      const kept = await this.slotRepo.count({
        where: { template_id: id, starts_at: MoreThan(new Date()) },
      });
      const result = await this.materialize(saved, new Date(), this.resolveUntil());
      return { template: saved, slots_removed: affected ?? 0, booked_slots_kept: kept, ...result };
    }

    // non-timing edits: push onto future slots; never shrink capacity below bookings
    const future = await this.slotRepo.find({
      where: { template_id: id, starts_at: MoreThan(new Date()) },
    });
    const toSave: Slot[] = [];
    let capacity_conflicts = 0;
    for (const slot of future) {
      if (dto.capacity !== undefined && dto.capacity < slot.booking_count) {
        capacity_conflicts++;
        continue;
      }
      if (dto.capacity !== undefined) slot.capacity = dto.capacity;
      if (dto.instructor_id) slot.instructor_id = dto.instructor_id;
      if (dto.activity_name) slot.activity_name = dto.activity_name;
      if (dto.location !== undefined) slot.location = dto.location;
      if (dto.booking_window_hours !== undefined) slot.booking_window_hours = dto.booking_window_hours;
      if (dto.cancellation_cutoff_hours !== undefined) slot.cancellation_cutoff_hours = dto.cancellation_cutoff_hours;
      toSave.push(slot);
    }
    await this.slotRepo.save(toSave);
    return { template: saved, slots_updated: toSave.length, capacity_conflicts };
  }

  // DELETE = deactivate (soft) + clear future empty slots; booked slots survive
  async deactivateTemplate(id: string, user: StaffJwtPayload) {
    const template = await this.findOneTemplate(id, user);
    template.is_active = false;
    await this.templateRepo.save(template);
    const { affected } = await this.slotRepo.delete({
      template_id: id, booking_count: 0, starts_at: MoreThan(new Date()),
    });
    const kept = await this.slotRepo.count({
      where: { template_id: id, starts_at: MoreThan(new Date()) },
    });
    return {
      message: 'Template deactivated. Future empty slots removed; slots with bookings were kept.',
      slots_removed: affected ?? 0,
      booked_slots_kept: kept,
    };
  }

  async generateForTemplate(id: string, dto: GenerateSlotsDto, user: StaffJwtPayload) {
    const template = await this.findOneTemplate(id, user);
    if (!template.is_active) throw new ConflictException('Template is deactivated');
    const result = await this.materialize(template, new Date(), this.resolveUntil(dto.until));
    return { ...result, ...(await this.window(id)) };
  }

  // ── Slots ────────────────────────────────────────────────────────────────

  async createSlot(dto: CreateSlotDto, user: StaffJwtPayload): Promise<Slot> {
    const gym = await assertGymAccess(dto.gym_id, user, this.gymRepo);
    await this.assertInstructor(dto.instructor_id, gym);
    const starts = new Date(dto.starts_at);
    const ends = new Date(dto.ends_at);
    if (ends <= starts) throw new BadRequestException('ends_at must be after starts_at');
    await this.assertNoInstructorOverlap(dto.instructor_id, starts, ends);
    return this.slotRepo.save(this.slotRepo.create({ ...dto, starts_at: starts, ends_at: ends }));
  }

  async findSlots(
    user: StaffJwtPayload,
    filters: { gym_id?: string; from?: string; to?: string; status?: SlotStatus; template_id?: string },
  ) {
    const ids = await this.gymFilter(user, filters.gym_id);
    // default window: today onwards, one horizon ahead — the calendar view
    const from = filters.from ? new Date(filters.from) : this.startOfToday();
    const to = filters.to ? new Date(filters.to) : this.addDays(from, HORIZON_DAYS);
    return this.slotRepo.find({
      where: {
        ...(ids ? { gym_id: In(ids) } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.template_id ? { template_id: filters.template_id } : {}),
        starts_at: Between(from, to),
      },
      relations: { instructor: true },
      select: { instructor: { id: true, email: true } },
      order: { starts_at: 'ASC' },
    });
  }

  // detail incl. roster preview (who's booked)
  async findOneSlot(id: string, user: StaffJwtPayload): Promise<Slot> {
    const slot = await this.slotRepo.findOne({
      where: { id },
      relations: { instructor: true, bookings: { member: true } },
      select: {
        instructor: { id: true, email: true },
        bookings: {
          id: true, status: true, waitlist_position: true, checked_in_at: true, created_at: true,
          member: { id: true, full_name: true, email: true },
        },
      },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    await assertGymAccess(slot.gym_id, user, this.gymRepo);
    return slot;
  }

  // "this occurrence only" — sibling slots and the template are untouched
  async updateSlot(id: string, dto: UpdateSlotDto, user: StaffJwtPayload): Promise<Slot> {
    const slot = await this.findOneSlot(id, user);
    if (dto.capacity !== undefined && dto.capacity < slot.booking_count) {
      throw new ConflictException(
        `Capacity ${dto.capacity} is below the current booking count (${slot.booking_count})`,
      );
    }
    if (dto.instructor_id) {
      const gym = await this.gymRepo.findOneByOrFail({ id: slot.gym_id });
      await this.assertInstructor(dto.instructor_id, gym);
    }
    const starts = dto.starts_at ? new Date(dto.starts_at) : slot.starts_at;
    const ends = dto.ends_at ? new Date(dto.ends_at) : slot.ends_at;
    if (ends <= starts) throw new BadRequestException('ends_at must be after starts_at');
    if (dto.starts_at || dto.ends_at || dto.instructor_id) {
      await this.assertNoInstructorOverlap(dto.instructor_id ?? slot.instructor_id, starts, ends, id);
    }
    Object.assign(slot, dto, { starts_at: starts, ends_at: ends });
    return this.slotRepo.save(slot);
  }

  // disable ≠ delete: bookings stay on record, booked members get an email
  async disableSlot(id: string, user: StaffJwtPayload) {
    const slot = await this.findOneSlot(id, user);
    if (slot.status === SlotStatus.DISABLED) throw new ConflictException('Slot is already disabled');
    slot.status = SlotStatus.DISABLED;
    await this.slotRepo.save(slot);

    const gym = await this.gymRepo.findOneByOrFail({ id: slot.gym_id });
    const affected = (slot.bookings ?? []).filter(
      (b) => b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.WAITLISTED,
    );
    // best-effort notifications — a dead mailbox/push must not undo the disable
    const results = await Promise.allSettled(
      affected.map((b) =>
        this.notificationsService.notifySlotDisabled(
          b.member_id, gym.id, gym.name, slot.activity_name, slot.starts_at,
        ),
      ),
    );
    const notified = results.filter((r) => r.status === 'fulfilled').length;
    return { message: 'Slot disabled.', affected_bookings: affected.length, members_notified: notified };
  }

  async enableSlot(id: string, user: StaffJwtPayload) {
    const slot = await this.findOneSlot(id, user);
    if (slot.status === SlotStatus.ENABLED) throw new ConflictException('Slot is already enabled');
    slot.status = SlotStatus.ENABLED;
    await this.slotRepo.save(slot);
    return { message: 'Slot enabled.' };
  }

  // hard delete — only for slots nobody ever booked; otherwise disable
  async deleteSlot(id: string, user: StaffJwtPayload) {
    const slot = await this.findOneSlot(id, user);
    if ((slot.bookings ?? []).length > 0) {
      throw new ConflictException('Slot has bookings — disable it instead of deleting');
    }
    await this.slotRepo.delete({ id });
    return { message: 'Slot deleted.' };
  }

  // ── Member-facing browse ─────────────────────────────────────────────────

  // disabled slots are hidden from members entirely (product decision)
  async browseSlots(user: MemberJwtPayload, gymId?: string, from?: string, to?: string) {
    if (gymId && !user.gym_ids.includes(gymId)) throw new ForbiddenException('Access denied');
    const gymIds = gymId ? [gymId] : user.gym_ids;
    if (gymIds.length === 0) return [];
    const now = new Date();
    const fromDate = from && new Date(from) > now ? new Date(from) : now;
    const toDate = to ? new Date(to) : this.addDays(fromDate, HORIZON_DAYS);
    const slots = await this.slotRepo.find({
      where: {
        gym_id: In(gymIds),
        status: SlotStatus.ENABLED,
        starts_at: Between(fromDate, toDate),
      },
      relations: { instructor: true },
      select: { instructor: { id: true, email: true } },
      order: { starts_at: 'ASC' },
    });
    return slots.map((s) => {
      const opensAt = new Date(s.starts_at.getTime() - s.booking_window_hours * 3600_000);
      const cutoffAt = new Date(s.starts_at.getTime() - s.cancellation_cutoff_hours * 3600_000);
      return {
        ...s,
        spots_remaining: Math.max(0, s.capacity - s.booking_count),
        is_full: s.booking_count >= s.capacity,
        booking_opens_at: opensAt,
        cancellation_cutoff_at: cutoffAt,
        booking_open: now >= opensAt && now < s.starts_at,
      };
    });
  }

  // ── Cron: keep the rolling horizon materialized ──────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async horizonCron(): Promise<void> {
    const templates = await this.templateRepo.find({ where: { is_active: true } });
    for (const t of templates) {
      try {
        const { created } = await this.materialize(t, new Date(), this.resolveUntil());
        if (created > 0) this.logger.log(`Template ${t.id}: generated ${created} slot(s)`);
      } catch (err) {
        this.logger.error(`Slot generation failed for template ${t.id}`, err as Error);
      }
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  // expands the template's rrule and creates the missing slot instances;
  // idempotent (skips existing occurrences) and skips instructor conflicts
  private async materialize(template: SlotTemplate, from: Date, until: Date) {
    const occurrences = expandRrule(template.rrule, from, until);
    if (occurrences.length === 0) return { created: 0, skipped_existing: 0, skipped_conflicts: 0 };

    const existing = await this.slotRepo.find({
      where: { template_id: template.id, starts_at: Between(from, until) },
      select: { starts_at: true },
    });
    const existingTimes = new Set(existing.map((s) => s.starts_at.getTime()));

    // one query for the instructor's whole window, conflict-check in memory
    const instructorSlots = await this.slotRepo.find({
      where: {
        instructor_id: template.instructor_id,
        status: SlotStatus.ENABLED,
        starts_at: Between(this.addDays(from, -1), until),
      },
      select: { id: true, template_id: true, starts_at: true, ends_at: true },
    });
    const busy = instructorSlots
      .filter((s) => s.template_id !== template.id)
      .map((s) => ({ start: s.starts_at.getTime(), end: s.ends_at.getTime() }));

    const toCreate: Partial<Slot>[] = [];
    let skippedExisting = 0, skippedConflicts = 0;
    for (const start of occurrences) {
      if (existingTimes.has(start.getTime())) { skippedExisting++; continue; }
      const end = new Date(start.getTime() + template.duration_minutes * 60_000);
      if (busy.some((b) => start.getTime() < b.end && end.getTime() > b.start)) {
        skippedConflicts++;
        continue;
      }
      toCreate.push({
        template_id: template.id,
        gym_id: template.gym_id,
        instructor_id: template.instructor_id,
        activity_name: template.activity_name,
        location: template.location,
        starts_at: start,
        ends_at: end,
        capacity: template.capacity,
        booking_window_hours: template.booking_window_hours,
        cancellation_cutoff_hours: template.cancellation_cutoff_hours,
      });
    }
    if (toCreate.length) await this.slotRepo.save(this.slotRepo.create(toCreate));
    return { created: toCreate.length, skipped_existing: skippedExisting, skipped_conflicts: skippedConflicts };
  }

  // the materialized window is derived from slot rows — templates store no
  // "valid until"; generated_until = latest occurrence created so far
  private async windows(templateIds: string[]) {
    const map = new Map<string, { generated_until: Date | null; future_slots: number }>();
    for (const id of templateIds) map.set(id, { generated_until: null, future_slots: 0 });
    if (templateIds.length === 0) return map;
    const rows: { template_id: string; generated_until: Date; future_slots: string }[] =
      await this.slotRepo.createQueryBuilder('s')
        .select('s.template_id', 'template_id')
        .addSelect('MAX(s.starts_at)', 'generated_until')
        .addSelect('COUNT(*) FILTER (WHERE s.starts_at > NOW())', 'future_slots')
        .where('s.template_id IN (:...ids)', { ids: templateIds })
        .groupBy('s.template_id')
        .getRawMany();
    for (const r of rows) {
      map.set(r.template_id, { generated_until: r.generated_until, future_slots: Number(r.future_slots) });
    }
    return map;
  }

  private async window(templateId: string) {
    return (await this.windows([templateId])).get(templateId)!;
  }

  private async assertInstructor(instructorId: string, gym: Gym): Promise<StaffUser> {
    const instructor = await this.staffRepo.findOne({ where: { id: instructorId } });
    if (!instructor || !instructor.is_active) throw new NotFoundException('Instructor not found');
    if (instructor.organization_id !== gym.organization_id) {
      throw new ForbiddenException('Instructor belongs to a different organization');
    }
    return instructor;
  }

  private async assertNoInstructorOverlap(
    instructorId: string, starts: Date, ends: Date, excludeSlotId?: string,
  ): Promise<void> {
    const qb = this.slotRepo.createQueryBuilder('s')
      .where('s.instructor_id = :instructorId', { instructorId })
      .andWhere('s.status = :status', { status: SlotStatus.ENABLED })
      .andWhere('s.starts_at < :ends AND s.ends_at > :starts', { starts, ends });
    if (excludeSlotId) qb.andWhere('s.id != :excludeSlotId', { excludeSlotId });
    const clash = await qb.getOne();
    if (clash) {
      throw new ConflictException(
        `Instructor already has "${clash.activity_name}" from ${clash.starts_at.toISOString()} to ${clash.ends_at.toISOString()}`,
      );
    }
  }

  // same scoping rule as the other modules: explicit gym_id must be in scope
  private async gymFilter(user: StaffJwtPayload, gymId?: string): Promise<string[] | null> {
    const scope = await scopedGymIds(user, this.gymRepo);
    if (gymId) {
      if (scope && !scope.includes(gymId)) throw new ForbiddenException('Access denied');
      return [gymId];
    }
    return scope;
  }

  private resolveUntil(until?: string): Date {
    const date = until ? new Date(until) : this.addDays(new Date(), HORIZON_DAYS);
    if (isNaN(date.getTime())) throw new BadRequestException('Invalid date');
    if (date > this.addDays(new Date(), MAX_GENERATE_DAYS)) {
      throw new BadRequestException(`Cannot generate more than ${MAX_GENERATE_DAYS} days ahead`);
    }
    if (date <= new Date()) throw new BadRequestException('Date must be in the future');
    return date;
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 86_400_000);
  }
}
