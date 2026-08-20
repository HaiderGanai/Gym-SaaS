import { SubscriptionStatus } from './entities/member-subscription.entity';
import { computeSubscriptionProgress, checkInsWindow, pausedDaysElapsed } from './subscription-progress.util';

describe('pausedDaysElapsed', () => {
  it('does not credit a bonus day for a pause under 24h', () => {
    const days = pausedDaysElapsed(
      '2026-08-17T08:49:00.000Z',
      new Date('2026-08-17T21:49:00.000Z'), // 13h later
    );
    expect(days).toBe(0);
  });

  it('credits exactly the whole days elapsed for a multi-day pause', () => {
    const days = pausedDaysElapsed(
      '2026-08-10T00:00:00.000Z',
      new Date('2026-08-12T18:00:00.000Z'), // 2.75 days later
    );
    expect(days).toBe(2);
  });
});

describe('computeSubscriptionProgress', () => {
  it('computes days_left from today for an active subscription', () => {
    const result = computeSubscriptionProgress(
      {
        status: SubscriptionStatus.ACTIVE,
        current_period_start: '2026-08-01',
        current_period_end: '2026-08-31',
        paused_at: null,
      },
      new Date('2026-08-28T00:00:00.000Z'),
    );
    expect(result).toEqual({ total_days: 30, days_left: 3 });
  });

  it('floors days_left at 0 for an active subscription past its end date', () => {
    const result = computeSubscriptionProgress(
      {
        status: SubscriptionStatus.ACTIVE,
        current_period_start: '2026-08-01',
        current_period_end: '2026-08-31',
        paused_at: null,
      },
      new Date('2026-09-05T00:00:00.000Z'),
    );
    expect(result.days_left).toBe(0);
  });

  it('freezes days_left at the pause moment, ignoring "now"', () => {
    const result = computeSubscriptionProgress(
      {
        status: SubscriptionStatus.PAUSED,
        current_period_start: '2026-08-01',
        current_period_end: '2026-08-31',
        paused_at: '2026-08-10T00:00:00.000Z',
      },
      new Date('2026-08-28T00:00:00.000Z'), // "now" is way past pause — must be ignored
    );
    expect(result).toEqual({ total_days: 30, days_left: 21 });
  });

  it('zeroes everything for a cancelled subscription', () => {
    const result = computeSubscriptionProgress({
      status: SubscriptionStatus.CANCELLED,
      current_period_start: '2026-08-01',
      current_period_end: '2026-08-31',
      paused_at: null,
    });
    expect(result).toEqual({ total_days: 0, days_left: 0 });
  });

  it('zeroes everything for a past_due subscription', () => {
    const result = computeSubscriptionProgress({
      status: SubscriptionStatus.PAST_DUE,
      current_period_start: '2026-08-01',
      current_period_end: '2026-08-31',
      paused_at: null,
    });
    expect(result).toEqual({ total_days: 0, days_left: 0 });
  });
});

describe('checkInsWindow', () => {
  it('bounds an active subscription window from period_start to today', () => {
    const window = checkInsWindow(
      {
        status: SubscriptionStatus.ACTIVE,
        current_period_start: '2026-08-01',
        current_period_end: '2026-08-31',
        paused_at: null,
      },
      new Date('2026-08-28T00:00:00.000Z'),
    );
    expect(window).toEqual({ from: '2026-08-01', to: '2026-08-28' });
  });

  it('bounds a paused subscription window from period_start to the pause date', () => {
    const window = checkInsWindow(
      {
        status: SubscriptionStatus.PAUSED,
        current_period_start: '2026-08-01',
        current_period_end: '2026-08-31',
        paused_at: '2026-08-10T00:00:00.000Z',
      },
      new Date('2026-08-28T00:00:00.000Z'),
    );
    expect(window).toEqual({ from: '2026-08-01', to: '2026-08-10' });
  });

  it('returns null for a cancelled subscription', () => {
    const window = checkInsWindow({
      status: SubscriptionStatus.CANCELLED,
      current_period_start: '2026-08-01',
      current_period_end: '2026-08-31',
      paused_at: null,
    });
    expect(window).toBeNull();
  });
});
