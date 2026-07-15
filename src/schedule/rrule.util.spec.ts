import { BadRequestException } from '@nestjs/common';
import { expandRrule } from './rrule.util';

describe('expandRrule', () => {
  const rule = 'DTSTART:20260720T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR';

  it('expands weekly occurrences at the DTSTART time', () => {
    const dates = expandRrule(rule, new Date('2026-07-19'), new Date('2026-07-27'));
    expect(dates.map((d) => d.toISOString())).toEqual([
      '2026-07-20T09:00:00.000Z',
      '2026-07-22T09:00:00.000Z',
      '2026-07-24T09:00:00.000Z',
    ]);
  });

  it('rejects rules without DTSTART', () => {
    expect(() => expandRrule('FREQ=DAILY', new Date(), new Date())).toThrow(BadRequestException);
  });

  it('rejects garbage', () => {
    expect(() => expandRrule('DTSTART:nope\nRRULE:???', new Date(), new Date())).toThrow(
      BadRequestException,
    );
  });
});
