import { BadRequestException } from '@nestjs/common';
import { rrulestr } from 'rrule';

// Parses an RFC 5545 string (must carry DTSTART so occurrence times are
// deterministic) and returns occurrence start dates in [from, until].
export function expandRrule(rrule: string, from: Date, until: Date): Date[] {
  if (!/DTSTART/i.test(rrule)) {
    throw new BadRequestException(
      'rrule must include a DTSTART line, e.g. "DTSTART:20260720T090000Z\\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"',
    );
  }
  try {
    return rrulestr(rrule).between(from, until, true);
  } catch {
    throw new BadRequestException('Invalid rrule string');
  }
}
