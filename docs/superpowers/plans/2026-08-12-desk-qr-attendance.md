# Desk QR Check-In + Attendance Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second gym-entry method (a static per-gym QR a member scans themselves), have it mark daily attendance (shared with the existing staff-scanned personal entry QR), and surface derived `total_days` / `check_ins` / `days_left` fields on `GET /subscriptions/me`, correctly frozen during a pause.

**Architecture:** One new `Attendance` entity (table `attendances`, unique on member+gym+day) owned by `BookingsModule`, written through one shared `markAttendanceOnce()` helper called from both the existing staff-scanned entry check-in and a new member-scanned desk-QR check-in. `SubscriptionsService.findMine()` derives the three new fields at read time from existing `MemberSubscription` columns plus a count against `Attendance` — no new columns on `MemberSubscription`.

**Tech Stack:** NestJS 11, TypeORM (Postgres, `synchronize` in dev — no migration files needed), `@nestjs/jwt` for QR token signing, `qrcode` package for QR image rendering (already a dependency), Jest for the one pure-function unit test.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-12-desk-qr-attendance-design.md` — re-read it if a task here is ambiguous.
- All routes are mounted under `/api/v1` (global prefix, already configured in `main.ts` — do not add it again in controller paths).
- Follow the codebase's existing scanner-response convention: check-in endpoints return HTTP 200 with `{ allowed: boolean, reason?: string, ... }`, never a 4xx, so scanner UIs don't need error-branch handling.
- QR JWTs use a `typ` discriminator claim (`'entry' | 'booking' | 'gym'`) verified by `BookingsService.verifyQr()` — never introduce a second signing/verification path.
- `'date'`-typed Postgres columns round-trip as `'YYYY-MM-DD'` strings through TypeORM, not `Date` objects — every date comparison in this plan accounts for that (see the existing `dayStart`/`dayEnd` helpers in `bookings.service.ts` for the established pattern).
- No DB migration files — this project runs `synchronize: config.get('NODE_ENV') !== 'production'`; new entities/columns appear automatically when the app boots against a dev/scratch DB.
- Verify every task by booting against a scratch DB per the `verify` skill (`docs` below) — this codebase does not unit-test TypeORM-repository-backed service methods (see `src/schedule/rrule.util.spec.ts` for the one precedent: pure functions get Jest tests, DB-coupled logic gets a live-boot walkthrough).

---

## Verification environment (use for every task's manual checks)

```bash
psql -h localhost -U postgres -c "CREATE DATABASE gym_saas_verify"
npm run build
DB_HOST=localhost DB_USER=postgres DB_PASSWORD=<local pw> DB_NAME=gym_saas_verify \
  PORT=4100 JWT_SECRET=verify-secret NODE_ENV=development node dist/main.js &
DB_HOST=localhost DB_USER=postgres DB_PASSWORD=<local pw> DB_NAME=gym_saas_verify node seed.js
```
Base URL: `http://localhost:4100/api/v1`. Seed prints org/gym IDs and `owner@test.com` / `Test1234!` (org_admin), `super@platform.com` / `Super1234!` (super_admin). Never point this at `.env`'s DB (the deployed droplet). Kill only your own server PID when done; `DROP DATABASE gym_saas_verify` afterward.

---

### Task 1: `Attendance` entity + wiring into `Member`/`Gym`/`BookingsModule`

**Files:**
- Create: `src/bookings/entities/attendance.entity.ts`
- Modify: `src/members/entities/member.entity.ts`
- Modify: `src/gym/entities/gym.entity.ts`
- Modify: `src/bookings/bookings.module.ts`

**Interfaces:**
- Produces: `Attendance` entity class with columns `id, member_id, gym_id, date (string, 'YYYY-MM-DD'), checked_in_at (Date), created_at (Date)`, unique on `(member_id, gym_id, date)`. Later tasks import this from `../../bookings/entities/attendance.entity` (from `bookings/`) or `../bookings/entities/attendance.entity` (from `subscriptions/`).

- [ ] **Step 1: Create the entity**

```typescript
// bookings/entities/attendance.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { Member } from '../../members/entities/member.entity';
import { Gym } from '../../gym/entities/gym.entity';

// one row per member per gym per day — the unique constraint below is what
// enforces "attendance marks once per day", not application code. Written
// through BookingsService.markAttendanceOnce() from both check-in paths
// (staff-scanned personal entry QR and member-scanned desk QR).
@Unique(['member_id', 'gym_id', 'date'])
@Entity('attendances')
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  member_id!: string;

  @ManyToOne(() => Member, (m) => m.attendances)
  @JoinColumn({ name: 'member_id' })
  member!: Member;

  @Column()
  gym_id!: string;

  @ManyToOne(() => Gym, (g) => g.attendances)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'timestamp' })
  checked_in_at!: Date;

  @CreateDateColumn()
  created_at!: Date;
}
```

- [ ] **Step 2: Add the back-relation to `Member`**

In `src/members/entities/member.entity.ts`, add the import alongside the existing entity imports:

```typescript
import { Attendance } from '../../bookings/entities/attendance.entity';
```

Add this relation to the `Member` class, alongside the other `@OneToMany` relations (e.g. after `bookings!: Booking[];`):

```typescript
  @OneToMany(() => Attendance, (a) => a.member)
  attendances!: Attendance[];
```

- [ ] **Step 3: Add the back-relation to `Gym`**

In `src/gym/entities/gym.entity.ts`, add the import alongside the existing entity imports (this file uses absolute `src/...` imports — match that style):

```typescript
import { Attendance } from 'src/bookings/entities/attendance.entity';
```

Add this relation to the `Gym` class, alongside the other `@OneToMany` relations (e.g. after `waivers!: Waiver[];`):

```typescript
  @OneToMany(() => Attendance, (a) => a.gym)
  attendances!: Attendance[];
```

- [ ] **Step 4: Register the entity in `BookingsModule`**

In `src/bookings/bookings.module.ts`, add the import:

```typescript
import { Attendance } from './entities/attendance.entity';
```

Add `Attendance` to the `TypeOrmModule.forFeature([...])` array (currently `[Booking, Slot, MemberSubscription, Member, Gym]` → becomes `[Booking, Slot, MemberSubscription, Member, Gym, Attendance]`).

- [ ] **Step 5: Verify the table is created correctly**

Boot against a scratch DB per the verification environment above, then:

```bash
psql -h localhost -U postgres -d gym_saas_verify -c "\d attendances"
```

Expected: columns `id, member_id, gym_id, date, checked_in_at, created_at` and a unique constraint spanning `member_id, gym_id, date` (look for a line like `"UQ_..." UNIQUE CONSTRAINT, btree (member_id, gym_id, date)`).

- [ ] **Step 6: Commit**

```bash
git add src/bookings/entities/attendance.entity.ts src/members/entities/member.entity.ts src/gym/entities/gym.entity.ts src/bookings/bookings.module.ts
git commit -m "feat: add Attendance entity for gym-entry check-ins"
```

---

### Task 2: Staff-facing printable desk QR (`GET /gyms/:id/qr`)

**Files:**
- Modify: `src/bookings/bookings.service.ts`
- Modify: `src/bookings/bookings.controller.ts`
- Modify: `src/bookings/bookings.module.ts`

**Interfaces:**
- Consumes: `assertGymAccess(gymId, user, gymRepo)` (existing, from `../common/utils/gym-scope`) — returns the `Gym` row or throws.
- Produces: `BookingsService.gymQr(gymId: string, user: StaffJwtPayload): Promise<{ gym_id: string; gym_name: string; qr_token: string; qr_image: string }>`. `GymQrController` exported from `bookings.controller.ts`, routed at `GET /gyms/:id/qr`.

- [ ] **Step 1: Widen the QR `typ` union and add `gymQr()` to `BookingsService`**

In `src/bookings/bookings.service.ts`, change the `verifyQr` signature from:

```typescript
  private verifyQr(token: string, typ: 'entry' | 'booking'): Record<string, any> | null {
```

to:

```typescript
  private verifyQr(token: string, typ: 'entry' | 'booking' | 'gym'): Record<string, any> | null {
```

Add this method near `entryQr()` (same "Member: gym-door entry QR" section is a reasonable neighbor, or a new `// ── Staff: printable desk QR ──` section above `// ── Staff: scan endpoints`):

```typescript
  // one static, effectively-permanent QR per gym — printed once and left on
  // the desk. The token alone grants nothing: every scan of it still runs
  // activeSubscription() live, so a photographed/leaked poster can't bypass
  // membership status.
  async gymQr(gymId: string, user: StaffJwtPayload) {
    const gym = await assertGymAccess(gymId, user, this.gymRepo);
    const qr_token = this.jwtService.sign({ typ: 'gym', gym_id: gym.id }, { expiresIn: '3650d' });
    return {
      gym_id: gym.id,
      gym_name: gym.name,
      qr_token,
      qr_image: await QRCode.toDataURL(qr_token),
    };
  }
```

- [ ] **Step 2: Add `GymQrController`**

In `src/bookings/bookings.controller.ts`, add these imports at the top (alongside the existing ones):

```typescript
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
```

Add this controller at the end of the file (same file as `CheckinController`/`EntryQrController` — QR logic stays centralized here per the existing precedent noted in that file's own comments):

```typescript
// staff-facing: fetch the gym's printable static entry QR
@Controller('gyms')
export class GymQrController {
  constructor(private bookingsService: BookingsService) {}

  @Get(':id/qr')
  @UseGuards(StaffJwtGuard, RolesGuard)
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  gymQr(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: StaffJwtPayload) {
    return this.bookingsService.gymQr(id, user);
  }
}
```

- [ ] **Step 3: Register `GymQrController` in `BookingsModule`**

In `src/bookings/bookings.module.ts`, update the import from `./bookings.controller` to include `GymQrController`:

```typescript
import { BookingsController, CheckinController, EntryQrController, GymQrController } from './bookings.controller';
```

Add `GymQrController` to the `controllers` array: `[BookingsController, CheckinController, EntryQrController, GymQrController]`.

- [ ] **Step 4: Verify**

Boot against a scratch DB (Task 1's verification steps, restart if still running). Login as org_admin (`owner@test.com` / `Test1234!`), then:

```bash
TOKEN=<org_admin access_token>
GYM_ID=<seeded gym id, printed by seed.js>
curl -s -X GET "http://localhost:4100/api/v1/gyms/$GYM_ID/qr" -H "Authorization: Bearer $TOKEN" | head -c 300
```

Expected: JSON with `gym_id`, `gym_name`, `qr_token` (a JWT string), and `qr_image` starting with `data:image/png;base64,`.

Then confirm role restriction — invite/seed or reuse a `front_desk` account if one exists in the seed data; if not, skip the negative check and just confirm the `@Roles` decorator lists only `ORG_ADMIN, GYM_MANAGER` by inspection (front_desk and unauthenticated calls should 403/401 respectively — this follows directly from the existing `RolesGuard`/`StaffJwtGuard` behavior already relied on elsewhere in the codebase).

- [ ] **Step 5: Commit**

```bash
git add src/bookings/bookings.service.ts src/bookings/bookings.controller.ts src/bookings/bookings.module.ts
git commit -m "feat: add GET /gyms/:id/qr printable desk entry QR"
```

---

### Task 3: Attendance marking + member-scanned desk QR (`POST /checkin/gym-scan`)

**Files:**
- Modify: `src/bookings/bookings.service.ts`
- Modify: `src/bookings/bookings.controller.ts`

**Interfaces:**
- Consumes: `Attendance` entity (Task 1), `activeSubscription()` (existing private helper in `BookingsService`), `verifyQr()` (Task 2's widened union).
- Produces: `BookingsService.markAttendanceOnce(memberId: string, gymId: string): Promise<boolean>` (private — `true` means this call was the first mark of the day). `BookingsService.checkinGymScan(token: string, user: MemberJwtPayload): Promise<{ allowed: boolean; reason?: string; gym?: { id: string; name: string }; subscription?: { status: SubscriptionStatus; plan: string; period_end: Date }; already_checked_in_today?: boolean }>`. `checkinEntry()` (existing) now also calls `markAttendanceOnce()` on success.

- [ ] **Step 1: Inject the `Attendance` repository**

In `src/bookings/bookings.service.ts`, add the import:

```typescript
import { Attendance } from './entities/attendance.entity';
```

Add to the constructor's repository injections (alongside the existing ones):

```typescript
    @InjectRepository(Attendance) private attendanceRepo: Repository<Attendance>,
```

- [ ] **Step 2: Add `markAttendanceOnce()`**

Add this private helper near the other helpers at the bottom of the class (after `verifyQr`):

```typescript
  // one atomic upsert-or-skip — this is what makes "attendance marks once
  // per day" race-safe without a SELECT-then-INSERT check. Returns true only
  // when this call was the row that got inserted.
  private async markAttendanceOnce(memberId: string, gymId: string): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    const result = await this.attendanceRepo
      .createQueryBuilder()
      .insert()
      .into(Attendance)
      .values({ member_id: memberId, gym_id: gymId, date: today, checked_in_at: new Date() })
      .orIgnore()
      .execute();
    return (result.identifiers?.length ?? 0) > 0;
  }
```

- [ ] **Step 3: Wire attendance marking into the existing staff-scanned `checkinEntry()`**

In `checkinEntry()`, find the final success return:

```typescript
    return {
      allowed: true,
      member,
      subscription: { status: sub.status, plan: sub.plan.name, period_end: sub.current_period_end },
    };
```

Replace it with (adding the marking call immediately before the return, so a failed/short-circuited allow check never marks attendance):

```typescript
    await this.markAttendanceOnce(payload.member_id, payload.gym_id);
    return {
      allowed: true,
      member,
      subscription: { status: sub.status, plan: sub.plan.name, period_end: sub.current_period_end },
    };
```

- [ ] **Step 4: Add `checkinGymScan()`**

Add this method in the "Staff: scan endpoints" section's neighborhood — actually this one is member-facing, so add it just above that section with its own comment, right after `entryQr()`:

```typescript
  // ── Member: scans the gym's static desk QR themselves ───────────────────

  async checkinGymScan(token: string, user: MemberJwtPayload) {
    const payload = this.verifyQr(token, 'gym');
    if (!payload) return { allowed: false, reason: 'Invalid QR code' };
    const gymId = payload.gym_id;
    if (!user.gym_ids.includes(gymId)) return { allowed: false, reason: 'Access denied' };

    const gym = await this.gymRepo.findOne({ where: { id: gymId }, select: { id: true, name: true } });
    if (!gym) return { allowed: false, reason: 'Gym not found' };

    const sub = await this.activeSubscription(user.sub, gymId);
    if (!sub) {
      const latest = await this.subRepo.findOne({
        where: { member_id: user.sub, gym_id: gymId },
        order: { created_at: 'DESC' },
      });
      const reason = !latest
        ? 'No subscription at this gym'
        : latest.status === SubscriptionStatus.ACTIVE
          ? `Subscription period ended ${latest.current_period_end}`
          : `Subscription is ${latest.status}`;
      return { allowed: false, reason };
    }

    const justMarked = await this.markAttendanceOnce(user.sub, gymId);
    return {
      allowed: true,
      gym: { id: gym.id, name: gym.name },
      subscription: { status: sub.status, plan: sub.plan.name, period_end: sub.current_period_end },
      already_checked_in_today: !justMarked,
    };
  }
```

- [ ] **Step 5: Add the `POST /checkin/gym-scan` route**

In `src/bookings/bookings.controller.ts`, add this method to `CheckinController` (alongside `entry` and `booking`):

```typescript
  @Post('gym-scan')
  @UseGuards(MemberJwtGuard)
  gymScan(@Body() dto: CheckinDto, @CurrentUser() user: MemberJwtPayload) {
    return this.bookingsService.checkinGymScan(dto.qr_token, user);
  }
```

- [ ] **Step 6: Verify — the full loop, both entry paths sharing one attendance row**

Boot against a scratch DB. As org_admin, create a member (`POST /members/register` with the seeded `gym_id`), subscribe them to a plan with `mark_paid: true` (`POST /subscriptions`), then member-login.

```bash
STAFF_TOKEN=<org_admin token>
MEMBER_TOKEN=<member token>
GYM_ID=<seeded gym id>

# 1. Staff fetches the desk QR
QR=$(curl -s "http://localhost:4100/api/v1/gyms/$GYM_ID/qr" -H "Authorization: Bearer $STAFF_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['qr_token'])")

# 2. Member scans it — first time today
curl -s -X POST "http://localhost:4100/api/v1/checkin/gym-scan" \
  -H "Authorization: Bearer $MEMBER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"qr_token\":\"$QR\"}"
# Expected: allowed:true, already_checked_in_today:false

# 3. Member scans it again — same day
curl -s -X POST "http://localhost:4100/api/v1/checkin/gym-scan" \
  -H "Authorization: Bearer $MEMBER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"qr_token\":\"$QR\"}"
# Expected: allowed:true, already_checked_in_today:true

psql -h localhost -U postgres -d gym_saas_verify -c "SELECT member_id, gym_id, date FROM attendances"
# Expected: exactly ONE row

# 4. Staff scans the member's personal entry QR the same day (existing flow)
ENTRY_QR=$(curl -s "http://localhost:4100/api/v1/members/me/entry-qr" -H "Authorization: Bearer $MEMBER_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['qr_token'])")
curl -s -X POST "http://localhost:4100/api/v1/checkin/entry" \
  -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" \
  -d "{\"qr_token\":\"$ENTRY_QR\"}"
# Expected: allowed:true

psql -h localhost -U postgres -d gym_saas_verify -c "SELECT member_id, gym_id, date FROM attendances"
# Expected: STILL exactly ONE row — proves both entry paths share the same daily attendance record
```

Also confirm the negative path: a member with no subscription (or a different member not registered at this gym) scanning the desk QR gets `allowed:false` with a reason, HTTP 200.

- [ ] **Step 7: Commit**

```bash
git add src/bookings/bookings.service.ts src/bookings/bookings.controller.ts
git commit -m "feat: add member-scanned desk QR check-in, shared attendance marking"
```

---

### Task 4: `subscription-progress.util.ts` — pure day-math + Jest tests

**Files:**
- Create: `src/subscriptions/subscription-progress.util.ts`
- Create: `src/subscriptions/subscription-progress.util.spec.ts`

**Interfaces:**
- Produces: `computeSubscriptionProgress(input: SubscriptionProgressInput, now?: Date): { total_days: number; days_left: number }` and `checkInsWindow(input: SubscriptionProgressInput, now?: Date): { from: string; to: string } | null`, both exported from `subscription-progress.util.ts`. `SubscriptionProgressInput = { status: SubscriptionStatus; current_period_start: Date | string; current_period_end: Date | string; paused_at: Date | string | null }` — this shape matches `MemberSubscription` exactly, so a `MemberSubscription` row can be passed directly. Task 5 imports both functions.

- [ ] **Step 1: Write the failing tests**

```typescript
// subscriptions/subscription-progress.util.spec.ts
import { SubscriptionStatus } from './entities/member-subscription.entity';
import { computeSubscriptionProgress, checkInsWindow } from './subscription-progress.util';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/subscriptions/subscription-progress.util.spec.ts`
Expected: FAIL — `Cannot find module './subscription-progress.util'`.

- [ ] **Step 3: Write the implementation**

```typescript
// subscriptions/subscription-progress.util.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/subscriptions/subscription-progress.util.spec.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/subscriptions/subscription-progress.util.ts src/subscriptions/subscription-progress.util.spec.ts
git commit -m "feat: add pure subscription-progress day-math with tests"
```

---

### Task 5: Wire `total_days`/`check_ins`/`days_left` into `GET /subscriptions/me`

**Files:**
- Modify: `src/subscriptions/subscriptions.module.ts`
- Modify: `src/subscriptions/subscriptions.service.ts`

**Interfaces:**
- Consumes: `Attendance` entity (Task 1, imported from `../bookings/entities/attendance.entity`), `computeSubscriptionProgress`/`checkInsWindow` (Task 4).
- Produces: `SubscriptionsService.findMine(memberId: string)` now returns `Promise<(MemberSubscription & { total_days: number; days_left: number; check_ins: number })[]>`. No controller change needed — `SubscriptionsController.findMine()` already just returns the service call, and Nest awaits promises transparently.

- [ ] **Step 1: Register `Attendance` in `SubscriptionsModule`**

In `src/subscriptions/subscriptions.module.ts`, add the import:

```typescript
import { Attendance } from '../bookings/entities/attendance.entity';
```

Add `Attendance` to the `TypeOrmModule.forFeature([...])` array (currently `[MemberSubscription, MembershipPlan, Discount, Gym, Member, MemberGymAccess]` → append `, Attendance`).

- [ ] **Step 2: Inject the repository and helpers in `SubscriptionsService`**

In `src/subscriptions/subscriptions.service.ts`, change the `typeorm` import line from:

```typescript
import { Repository, In, LessThan } from 'typeorm';
```

to:

```typescript
import { Repository, In, LessThan, Between } from 'typeorm';
```

Add these imports alongside the existing entity imports:

```typescript
import { Attendance } from '../bookings/entities/attendance.entity';
import { computeSubscriptionProgress, checkInsWindow } from './subscription-progress.util';
```

Add to the constructor's repository injections:

```typescript
    @InjectRepository(Attendance)
    private attendanceRepo: Repository<Attendance>,
```

- [ ] **Step 3: Rewrite `findMine()`**

Replace:

```typescript
  // member app: current plan summary
  findMine(memberId: string) {
    return this.subRepo.find({
      where: { member_id: memberId },
      relations: { plan: true },
      order: { created_at: 'DESC' },
    });
  }
```

with:

```typescript
  // member app: current plan summary, plus derived progress fields.
  // Attendance and subscription lifecycle are independent — a subscription
  // still ends on schedule regardless of attendance — so total_days/
  // days_left come purely from the subscription's own dates, and check_ins
  // is a separate count against Attendance for the same window.
  async findMine(memberId: string) {
    const subs = await this.subRepo.find({
      where: { member_id: memberId },
      relations: { plan: true },
      order: { created_at: 'DESC' },
    });
    return Promise.all(subs.map(async (sub) => {
      const { total_days, days_left } = computeSubscriptionProgress(sub);
      const window = checkInsWindow(sub);
      const check_ins = window
        ? await this.attendanceRepo.count({
            where: { member_id: memberId, gym_id: sub.gym_id, date: Between(window.from, window.to) },
          })
        : 0;
      return { ...sub, total_days, days_left, check_ins };
    }));
  }
```

- [ ] **Step 4: Verify — active, paused-frozen, and ended-zeroed cases**

Boot against a scratch DB. Subscribe a member to a monthly plan (`mark_paid: true`), then:

```bash
MEMBER_TOKEN=<member token>
curl -s "http://localhost:4100/api/v1/subscriptions/me" -H "Authorization: Bearer $MEMBER_TOKEN"
```
Expected: one subscription with `status: "active"`, `total_days` ≈ 30/31 (matches the plan's monthly length), `days_left` ≈ `total_days` (subscribed today), `check_ins: 0`.

Mark an attendance row for today directly (simulating a desk-QR scan already covered by Task 3's own verification):
```bash
psql -h localhost -U postgres -d gym_saas_verify -c \
  "INSERT INTO attendances (member_id, gym_id, date, checked_in_at) VALUES ('<member_id>', '<gym_id>', CURRENT_DATE, now())"
curl -s "http://localhost:4100/api/v1/subscriptions/me" -H "Authorization: Bearer $MEMBER_TOKEN"
```
Expected: `check_ins: 1`.

Pause it (`PATCH /subscriptions/me/:id/pause`), then re-fetch:
```bash
curl -s "http://localhost:4100/api/v1/subscriptions/me" -H "Authorization: Bearer $MEMBER_TOKEN"
```
Expected: `status: "paused"`, `days_left` unchanged from the value right before pausing (frozen), `total_days` unchanged.

Cancel it directly via SQL to reach the ended state without needing a resume-then-cancel round trip:
```bash
psql -h localhost -U postgres -d gym_saas_verify -c \
  "UPDATE member_subscriptions SET status='cancelled' WHERE member_id='<member_id>'"
curl -s "http://localhost:4100/api/v1/subscriptions/me" -H "Authorization: Bearer $MEMBER_TOKEN"
```
Expected: `total_days: 0, days_left: 0, check_ins: 0`.

- [ ] **Step 5: Commit**

```bash
git add src/subscriptions/subscriptions.module.ts src/subscriptions/subscriptions.service.ts
git commit -m "feat: surface total_days/check_ins/days_left on GET /subscriptions/me"
```

---

### Task 6: Documentation — `CLAUDE.md`, `ATTENDANCE_MODULE_OVERVIEW.md`, `ATTENDANCE_POSTMAN_ENDPOINTS.md`

**Files:**
- Modify: `CLAUDE.md`
- Create: `ATTENDANCE_MODULE_OVERVIEW.md`
- Create: `ATTENDANCE_POSTMAN_ENDPOINTS.md`

**Interfaces:**
- None — documentation only, no code interfaces produced or consumed.

- [ ] **Step 1: Update `CLAUDE.md`'s Active Endpoints table**

Find this row:
```
| GET | `/subscriptions/me` | MemberJwt | Member's own subscriptions + plan |
```
Replace with:
```
| GET | `/subscriptions/me` | MemberJwt | Member's own subscriptions + plan, plus derived `total_days`/`check_ins`/`days_left` (frozen while paused, zeroed once past_due/cancelled) |
```

Find the entry-QR / check-in rows (`GET /members/me/entry-qr`, `POST /checkin/entry`, `POST /checkin/booking`) and add two new rows immediately after `POST /checkin/booking`:
```
| GET | `/gyms/:id/qr` | StaffJwt + Roles(org_admin, gym_manager) | Printable static desk QR for the gym — `{ gym_id, gym_name, qr_token, qr_image }`, non-expiring in practice (10-year token) |
| POST | `/checkin/gym-scan` | MemberJwt | Member scans the gym's printed desk QR themselves → `{ allowed, reason?, gym?, subscription?, already_checked_in_today? }`; marks daily attendance (shared with `/checkin/entry`) |
```

- [ ] **Step 2: Update `CLAUDE.md`'s Key files section**

In the `src/bookings/` file listing, change:
```
src/bookings/
  bookings.module.ts
  bookings.controller.ts  ← BookingsController (/bookings) + CheckinController (/checkin) + EntryQrController (/members/me/entry-qr)
  bookings.service.ts     ← gates, atomic capacity claim, waitlist promotion, QR sign/verify
  entities/booking.entity.ts
  dto/create-booking.dto.ts, checkin.dto.ts
```
to:
```
src/bookings/
  bookings.module.ts
  bookings.controller.ts  ← BookingsController (/bookings) + CheckinController (/checkin) + EntryQrController (/members/me/entry-qr) + GymQrController (/gyms/:id/qr)
  bookings.service.ts     ← gates, atomic capacity claim, waitlist promotion, QR sign/verify, markAttendanceOnce()
  entities/booking.entity.ts, attendance.entity.ts
  dto/create-booking.dto.ts, checkin.dto.ts
```

In the `src/subscriptions/` file listing, change:
```
src/subscriptions/
  subscriptions.module.ts, subscriptions.controller.ts, subscriptions.service.ts  ← past_due cron (8:00 daily)
  entities/member-subscription.entity.ts
  dto/create-subscription.dto.ts, renew-subscription.dto.ts
```
to:
```
src/subscriptions/
  subscriptions.module.ts, subscriptions.controller.ts, subscriptions.service.ts  ← past_due cron (8:00 daily)
  subscription-progress.util.ts  ← pure total_days/days_left/check_ins-window math, unit-tested
  entities/member-subscription.entity.ts
  dto/create-subscription.dto.ts, renew-subscription.dto.ts
```

- [ ] **Step 3: Amend the `BookingsModule` bullet in `CLAUDE.md` section 6 (Build Status)**

Find the `BookingsModule` bullet (ends with `See \`BOOKINGS_MODULE_OVERVIEW.md\` + \`BOOKINGS_POSTMAN_ENDPOINTS.md\`.`). Append this sentence to it, before the period at the very end:

```
Also owns the printable per-gym desk entry QR and gym-attendance tracking (`Attendance`, one row per member/gym/day) — the same `markAttendanceOnce()` write path is shared by the existing staff-scanned personal entry QR and the new member-scanned desk QR, so attendance reflects a gym visit regardless of which method was used. See `ATTENDANCE_MODULE_OVERVIEW.md` + `ATTENDANCE_POSTMAN_ENDPOINTS.md`.
```

- [ ] **Step 4: Add a new Key Architectural Decisions entry to `CLAUDE.md`**

Add this new bullet at the end of section 8 (Key Architectural Decisions) — after whichever entry is currently last in that section (verify by reading the file first; do not assume a specific title, since the exact last entry can vary):

```markdown
**Attendance is derived from gym entry, not from subscription state**
`Attendance` (`member_id, gym_id, date`, unique per day) is written by one shared `BookingsService.markAttendanceOnce()` — an atomic `INSERT ... ON CONFLICT DO NOTHING` — called from both `checkinEntry()` (staff scans the member's personal entry QR) and the new `checkinGymScan()` (member scans a static per-gym desk QR themselves, `POST /checkin/gym-scan`). The desk QR is a long-lived (10-year) signed JWT with `typ: 'gym'`, printed once by staff via `GET /gyms/:id/qr` — the token itself grants nothing, since every scan still runs the same live `activeSubscription()` check the personal entry QR uses, so pause/cancel blocks entry through either method identically. Attendance and subscription lifecycle are deliberately independent: a subscription runs its full paid period whether the member shows up once or every day. `GET /subscriptions/me` surfaces this as three fields computed at read time (no new columns on `MemberSubscription`) via the pure `subscription-progress.util.ts` — `total_days` (period length), `days_left` (countdown to `current_period_end`), and `check_ins` (count of `Attendance` rows in the current period). Both `days_left` and the `check_ins` window freeze at `paused_at` while a subscription is paused rather than continuing to count down — consistent with `applyResume()` already shifting `current_period_end` forward by the exact days spent paused, so a paused member's progress numbers don't dip and jump. Once a subscription is `past_due` or `cancelled`, all three fields report `0` — there's no live progress left to show.
```

- [ ] **Step 5: Write `ATTENDANCE_MODULE_OVERVIEW.md`**

```markdown
# Gym Entry & Attendance — Overview

Two ways a member gets into the gym, one shared attendance record, and a subscription-progress readout that stays honest about the difference between "paid for" and "showed up."

## The two entry methods

1. **Personal entry QR (existing).** `GET /members/me/entry-qr` issues a member a QR tied to their own subscription period. Staff scan it at `POST /checkin/entry`.
2. **Desk QR (new).** Each gym has one static, printed QR — fetched by staff via `GET /gyms/:id/qr` and placed at the front desk. A member opens the app, scans it themselves, and the app calls `POST /checkin/gym-scan` with the scanned token. The response tells the member on the spot whether they're allowed in, and their current subscription details.

Both paths run the exact same live check: does this member have access to this gym (`gym_ids` on their JWT), and do they have an `active` `MemberSubscription` there right now (`current_period_end >= today`, `status = active`)? A paused, past_due, cancelled, or expired member is turned away by either method — pausing/cancelling revokes entry through both doors identically, not just one.

## The desk QR itself

`GET /gyms/:id/qr` (org_admin / gym_manager) signs a JWT `{ typ: 'gym', gym_id }` with a 10-year expiry — long enough that "print once, leave it on the desk" holds in practice, since a JWT technically requires a numeric expiry and there's no real "never" option. The token by itself is not a credential to get into the gym — it only identifies *which gym* was scanned. Every scan still re-checks the member's live subscription status, so a photographed or duplicated poster QR can't let anyone in without an actual active membership.

## Attendance — one record, two writers

`Attendance` (`attendances` table) has one row per `(member_id, gym_id, date)`, enforced by a database unique constraint — not application logic. `BookingsService.markAttendanceOnce()` is the single write path: an atomic `INSERT ... ON CONFLICT DO NOTHING`, so concurrent or repeated scans on the same day never create a second row and never need a manual "already checked in" lookup to avoid a duplicate.

Both `checkinEntry()` (staff-scanned personal QR) and `checkinGymScan()` (member-scanned desk QR) call this same helper after their allow check passes. A member who gets scanned in by staff in the morning and then scans the desk QR themselves in the afternoon still has exactly one attendance row for that day — the two entry methods are indistinguishable in the data by design.

## Attendance and subscriptions are independent

A subscription's `current_period_start`/`current_period_end` decide when it's paid through — that clock runs whether the member visits the gym every day or not at all. Attendance never extends or shortens a subscription. The two concepts are joined only for *display*, on `GET /subscriptions/me`:

| Field | Meaning | Source |
|---|---|---|
| `total_days` | Length of the current billing period | `current_period_end − current_period_start` |
| `days_left` | Days remaining until the subscription needs renewal | `current_period_end − today` (or frozen — see below) |
| `check_ins` | How many distinct days the member has entered this gym during the current period | Count of `Attendance` rows in the period window |

These are computed at request time (`SubscriptionsService.findMine()` via the pure `subscription-progress.util.ts`) — no new columns on `MemberSubscription`, matching how `ReportsModule` and `VatModule` already prefer live queries over stored snapshots elsewhere in this codebase.

### The pause freeze

Pausing a subscription (`PATCH /subscriptions/me/:id/pause` or the staff equivalent) already preserves the member's remaining paid time: `applyResume()` shifts `current_period_end` forward by exactly the number of days spent paused, so a pause never costs the member money or time. `days_left` and the `check_ins` counting window follow the same principle for display — while paused, both are computed as of the moment `paused_at` was stamped, not "today." Otherwise `days_left` would visibly count down during a pause the member isn't even benefiting from, only to jump back up on resume — technically correct after resume, but confusing in the meantime. Freezing the display at `paused_at` keeps what the member sees consistent with what `applyResume()` actually guarantees.

Access itself was already blocked during a pause before this feature existed — every entry gate requires `status === active`, not merely an unexpired period — so a paused member simply can't rack up new check-ins in the first place. The frozen window is a display detail, not a new access rule.

### Ended subscriptions show zero

Once a subscription is `past_due` or `cancelled`, `total_days`, `days_left`, and `check_ins` all report `0`. There's no live progress to show for a subscription that's no longer running — the member's history of actually attending is still in the `Attendance` table if it's ever needed for a report, but the `/subscriptions/me` progress readout is specifically about the *current* billing period, and an ended one doesn't have one.

## Files

```
src/bookings/
  entities/attendance.entity.ts   ← Attendance entity, unique(member_id, gym_id, date)
  bookings.service.ts             ← markAttendanceOnce(), gymQr(), checkinGymScan(), checkinEntry() (amended)
  bookings.controller.ts          ← GymQrController (/gyms/:id/qr), CheckinController.gymScan (/checkin/gym-scan)

src/subscriptions/
  subscription-progress.util.ts        ← pure total_days/days_left + check-ins window math
  subscription-progress.util.spec.ts   ← unit tests
  subscriptions.service.ts             ← findMine() wires the above together
```
```

- [ ] **Step 6: Write `ATTENDANCE_POSTMAN_ENDPOINTS.md`**

```markdown
# Attendance & Desk QR — Postman Endpoints

Base URL: `http://localhost:3000/api/v1` (dev). See `ATTENDANCE_MODULE_OVERVIEW.md` for the design rationale.

---

## `GET /gyms/:id/qr`

**Auth:** StaffJwt, `Roles(org_admin, gym_manager)`

Fetches the gym's static, printable entry QR. Same token every time it's called — this is not a rotating/one-time code.

**Response `200`:**
```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "gym_name": "Downtown Branch",
  "qr_token": "eyJhbGciOi...",
  "qr_image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA..."
}
```

`qr_image` is ready to render directly (`<img src="...">`) or send to a printer. Print `qr_image` once — it does not need to be re-fetched unless the gym loses the printout.

**Errors:**
- `403` — caller's role/org doesn't have access to this gym (same rule as every other gym-scoped staff endpoint: `super_admin` any gym, `org_admin` any gym in their org, `gym_manager` only their assigned gym(s)).
- `404` — gym not found.

---

## `POST /checkin/gym-scan`

**Auth:** MemberJwt

The member's app calls this immediately after scanning the desk QR. Always returns `200` — check the `allowed` flag, never treat this as an error response.

**Request:**
```json
{ "qr_token": "eyJhbGciOi..." }
```

**Response `200` — allowed:**
```json
{
  "allowed": true,
  "gym": { "id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3", "name": "Downtown Branch" },
  "subscription": { "status": "active", "plan": "Monthly Unlimited", "period_end": "2026-09-01" },
  "already_checked_in_today": false
}
```
`already_checked_in_today: true` means a prior scan (this endpoint or the staff-scanned personal entry QR) already marked today's attendance — the member is still let in, just informationally told they're already checked in for the day.

**Response `200` — denied (examples):**
```json
{ "allowed": false, "reason": "Invalid QR code" }
```
```json
{ "allowed": false, "reason": "Access denied" }
```
```json
{ "allowed": false, "reason": "No subscription at this gym" }
```
```json
{ "allowed": false, "reason": "Subscription is paused" }
```
```json
{ "allowed": false, "reason": "Subscription period ended 2026-07-15" }
```

---

## `GET /subscriptions/me` (changed)

**Auth:** MemberJwt

Existing endpoint — now returns three additional fields per subscription.

**Response `200`:**
```json
[
  {
    "id": "b1f2...",
    "member_id": "9a3c...",
    "plan_id": "4d21...",
    "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
    "status": "active",
    "current_period_start": "2026-08-01",
    "current_period_end": "2026-08-31",
    "paused_at": null,
    "plan": { "id": "4d21...", "name": "Monthly Unlimited", "type": "monthly", "price": "49.99" },
    "total_days": 30,
    "days_left": 3,
    "check_ins": 14
  }
]
```

**Field notes:**
- `total_days` — length of the current billing period in days.
- `days_left` — days remaining until `current_period_end`. **Frozen** at the value it had when `paused_at` was stamped if `status: "paused"` — it will not tick down further until the subscription is resumed (at which point `current_period_end` itself shifts forward to compensate, per the existing pause/resume behavior).
- `check_ins` — count of distinct days the member entered this gym (either entry method) during the current period. Also frozen at the pause moment while paused.
- All three are `0` once `status` is `"past_due"` or `"cancelled"` — there is no active period left to report progress against.
```

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md ATTENDANCE_MODULE_OVERVIEW.md ATTENDANCE_POSTMAN_ENDPOINTS.md
git commit -m "docs: document desk QR check-in and subscription progress fields"
```
