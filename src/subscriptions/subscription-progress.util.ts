import { SubscriptionStatus } from './entities/member-subscription.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionProgressInput {
  status: SubscriptionStatus;
  current_period_start: Date | string;
  current_period_end: Date | string;
  paused_at: Date | string | null;
}

export interface SubscriptionProgress {
  total_days: number;
  days_left: number;
}

// 'date' columns round-trip as 'YYYY-MM-DD' strings; paused_at is a real
// timestamp Date. Handle both.
function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  return value.length === 10 ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
}

function referenceDate(input: SubscriptionProgressInput, now: Date): Date {
  return input.status === SubscriptionStatus.PAUSED && input.paused_at
    ? toDate(input.paused_at)
    : now;
}

// Cancelled/past_due subscriptions are over — nothing to show. Paused
// subscriptions freeze at the pause moment: applyResume() already shifts
// current_period_end forward by the exact days spent paused, so freezing
// days_left here matches that time-preservation guarantee instead of
// dipping during the pause and jumping back on resume.
export function computeSubscriptionProgress(
  input: SubscriptionProgressInput,
  now: Date = new Date(),
): SubscriptionProgress {
  if (input.status !== SubscriptionStatus.ACTIVE && input.status !== SubscriptionStatus.PAUSED) {
    return { total_days: 0, days_left: 0 };
  }
  const start = toDate(input.current_period_start);
  const end = toDate(input.current_period_end);
  const total_days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const days_left = Math.max(
    0,
    Math.ceil((end.getTime() - referenceDate(input, now).getTime()) / DAY_MS),
  );
  return { total_days, days_left };
}

// Whole calendar days elapsed since a pause, for shifting current_period_end
// forward on resume. Floors, not rounds: a member paused 13h shouldn't be
// credited a full bonus day they were never actually paused for.
export function pausedDaysElapsed(pausedAt: Date | string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - toDate(pausedAt).getTime()) / DAY_MS);
}

// Mirrors the same freeze rule for the attendance count window: bounded by
// "today" while active, bounded by the pause moment while paused. Returns
// 'YYYY-MM-DD' strings for direct use in a TypeORM Between() on Attendance.date.
export function checkInsWindow(
  input: SubscriptionProgressInput,
  now: Date = new Date(),
): { from: string; to: string } | null {
  if (input.status !== SubscriptionStatus.ACTIVE && input.status !== SubscriptionStatus.PAUSED) {
    return null;
  }
  return {
    from: toDate(input.current_period_start).toISOString().slice(0, 10),
    to: referenceDate(input, now).toISOString().slice(0, 10),
  };
}
