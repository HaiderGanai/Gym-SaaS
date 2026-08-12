# Desk QR Check-In + Attendance Tracking — Design

Status: Approved
Date: 2026-08-12

## Problem

Members currently get into the gym via a personal entry QR (`GET /members/me/entry-qr`) that staff scan at the door. We're adding a second entry method: each gym prints one static QR code and places it on the front desk. A member opens the app, scans that code themselves, and the app tells them on the spot whether they're allowed in (active subscription, correct gym) plus their subscription details. That scan should also mark the member's attendance for the day — but only once, no matter how many times they scan.

Attendance and subscription are separate concepts: a subscription runs its full paid period regardless of how often the member shows up. `GET /subscriptions/me` needs three new derived fields per subscription so the app can show progress: `total_days`, `check_ins`, `days_left`. This must correctly interact with the existing pause/resume feature, which already preserves unused subscription time across a pause.

## Data model

New entity `Attendance` (table `attendances`), owned by `BookingsModule` alongside the rest of the QR/check-in logic:

```
id            uuid, PK
member_id     uuid
gym_id        uuid
date          date            -- calendar day of the check-in (server date)
checked_in_at timestamp       -- first scan time that day
created_at    timestamp
```

`@Unique(['member_id', 'gym_id', 'date'])` — one row per member per gym per day, enforced by Postgres. This is what guarantees "only once per day" without app-level locking.

No migration file needed — the project runs with TypeORM `synchronize` in dev (per CLAUDE.md); production sync is a separate, existing concern.

## Marking attendance — one shared helper, two entry points

`BookingsService.markAttendanceOnce(memberId, gymId): Promise<boolean>` performs one atomic `INSERT ... ON CONFLICT DO NOTHING` (TypeORM `.orIgnore()`) and returns whether a new row was inserted (`true` = first scan of the day, `false` = already marked).

Called from both:
- `checkinEntry()` (existing — staff scans the member's personal entry QR), after the existing allow check passes.
- `checkinGymScan()` (new — member scans the gym's desk QR), after the same allow check.

Both entry methods feed the same attendance record, so `check_ins` on `/subscriptions/me` reflects real gym entries regardless of which method the member used.

## The static desk QR

- New JWT `typ: 'gym'` payload: `{ typ: 'gym', gym_id }`. Signed with a 10-year `expiresIn` — JWTs require a numeric `exp`, so "never expires" is approximated with a duration long enough that the gym never needs to reprint it. The token alone grants nothing; every scan still does a live subscription check, so a leaked/photographed poster QR doesn't bypass membership status.
- `GET /gyms/:id/qr` — StaffJwt + Roles(org_admin, gym_manager), gym access checked via the existing `assertGymAccess` helper (org_admin org-wide, gym_manager own gym). Returns `{ gym_id, gym_name, qr_token, qr_image }` for staff to print. Implemented as a small `GymQrController` in `bookings.controller.ts` (`@Controller('gyms')`), following the same precedent as the existing `EntryQrController` — QR sign/verify logic stays centralized in `BookingsService` rather than duplicated into `GymModule`.

## Member scans the desk QR

`POST /checkin/gym-scan` — MemberJwt, new route on the existing `CheckinController`. Body: `{ qr_token }` (reuses `CheckinDto`).

Logic:
1. Verify token `typ === 'gym'` → extract `gym_id`.
2. `user.gym_ids.includes(gym_id)` — else `{ allowed: false, reason: 'Access denied' }`.
3. `activeSubscription(user.sub, gym_id)` (existing helper — already excludes paused/past_due/expired) — else `{ allowed: false, reason: <same messaging as checkinEntry> }`.
4. `markAttendanceOnce(user.sub, gym_id)`.
5. Return `200 { allowed: true, gym: { id, name }, subscription: { status, plan, period_end }, already_checked_in_today: boolean }`.

Follows the same "always 200, `allowed` flag" scanner-friendly convention CLAUDE.md documents for `/checkin/*`.

## `GET /subscriptions/me` — three new derived fields

Computed per subscription row in `SubscriptionsService.findMine()`, no new columns on `MemberSubscription`:

| Status | `total_days` | `days_left` | `check_ins` |
|---|---|---|---|
| `active` | `round((period_end − period_start) / day)` | `max(0, ceil((period_end − today) / day))` | count of `Attendance` rows for this member+gym in `[period_start, today]` |
| `paused` | same as active | `max(0, ceil((period_end − paused_at) / day))` — **frozen at the pause moment**, not today | count of `Attendance` rows in `[period_start, paused_at]` — also frozen |
| `past_due` / `cancelled` | `0` | `0` | `0` |

The pause freeze matters: `applyResume()` already shifts `current_period_end` forward by exactly the days spent paused, so the member's paid time is preserved. Freezing `days_left`/`check_ins` display at the pause moment keeps the number consistent with that guarantee instead of dipping and jumping back.

The "0/0/0 on ended" behavior make it visually obvious in the app that a `past_due`/`cancelled` row is history, not a live subscription — attendance and subscription progress are only meaningful while there's a subscription to track.

Requires `TypeOrmModule.forFeature([Attendance])` added to `SubscriptionsModule` (entity-only cross-import, same pattern already used for `Gym`/`Member` across modules — no import of `BookingsModule` itself, no circular dependency).

## Out of scope / deliberately skipped

- No QR rotation/regeneration workflow for the desk QR (permanent token, per requirements).
- No `method` column on `Attendance` distinguishing which entry path was used — not asked for, the two paths are meant to be indistinguishable in the data.
- No new attendance-listing/reporting endpoints — only the fields folded into `/subscriptions/me`. `ReportsModule` already has its own attendance-adjacent metrics (class attendance/fill-rate); gym-entry attendance reporting can be added later if asked for.

## Docs to update

- `CLAUDE.md`: new endpoint rows, `Attendance` entity + key files entry, one new "Key Architectural Decisions" bullet.
- New `ATTENDANCE_MODULE_OVERVIEW.md`.
- New `ATTENDANCE_POSTMAN_ENDPOINTS.md`.
