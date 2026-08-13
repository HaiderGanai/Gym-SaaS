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
