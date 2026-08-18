# Check-in Status — Overview

## What this is

One read-only endpoint, `GET /members/profile/checkin-status`, that answers the question a member's app home screen asks on every load: *"have I checked into the gym today, and if not, when did I last go?"*

It's a thin read over the existing `Attendance` table (`ATTENDANCE_MODULE_OVERVIEW.md`) — no new table, no new write path. `Attendance` already gets one row per member/gym/day from either check-in method (staff-scanned personal entry QR, or the member-scanned desk QR), so this endpoint just queries the most recent row and describes it.

## Why it lives in BookingsModule

`Attendance` is owned by `BookingsModule` (`bookings.service.ts`, alongside `markAttendanceOnce()` and the two check-in scan paths), so the read path lives next to the write path rather than reaching across modules. The route sits on the existing `EntryQrController` (`@Controller('members')`, each route giving its own full path) alongside `GET /members/me/entry-qr` — same controller, same auth, same gym-resolution convention, but under `/members/profile/` to match the `/members/profile` naming `PATCH`/`DELETE /members/profile` already use for member-self routes.

## Behavior

- `gym_id` is optional, same as `entry-qr`: defaults to the member's `primary_gym_id`, and 403s if the resolved gym isn't one of the member's `gym_ids`.
- Looks up the single most recent `Attendance` row for that member+gym (`ORDER BY date DESC LIMIT 1`) — no window/date-range query needed, since "last check-in" is just the newest row regardless of how far back it is.
- `checked_in_today` is `true` only when that latest row's `date` equals today (UTC calendar day — same basis every `date` column in this schema uses via the `pg` type-parser override documented in the root `CLAUDE.md`).
- `last_check_in` is `null` only when the member has never checked in at that gym. Otherwise it always reports the most recent visit, whether that's today, yesterday, or a month ago — `days_ago` is a plain integer, and `label` renders it as `"today"` / `"yesterday"` / `"N days ago"` (no special-casing past 1 day — "N days ago" already reads correctly at N=30).
- If the member checked in today, `checked_in_at` (top-level) mirrors `last_check_in.checked_in_at` for convenience, so a caller who only wants "did they check in today, at what time" doesn't have to reach into the nested object. It's `null` on any day they haven't checked in yet.

## What it deliberately doesn't do

- No streak counting, no per-gym history list, no pagination — not asked for. If a "check-in history" screen shows up later, that's a `GET /members/me/checkin-history?gym_id=` querying `Attendance` with a date range, not a change to this endpoint.
- No caching/denormalization — `Attendance` is small per member (one row per day checked in), so a plain indexed query (`member_id, gym_id, date` is already the entity's unique constraint, so it's indexed) is enough.
