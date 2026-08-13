# Membership Pause/Resume — Overview

## What this is

A member can pause their own gym subscription and resume it later, without
losing the membership time they already paid for. Staff (`org_admin` /
`gym_manager`) could already do this on a member's behalf — this adds the
member-facing self-service version and fixes the date math on resume so
paused time is no longer silently forfeited.

## The behavior

Say a member's subscription runs **6 Aug → 6 Sep**. On **13 Aug** they pause
it. They resume on **20 Aug** — 7 days later. Their subscription now runs
until **13 Sep**, not 6 Sep: the 7 paused days were added back onto
`current_period_end`.

While paused:
- The member **cannot book classes** — `BookingsService` only accepts
  bookings from a subscription with `status = active`.
- The member **cannot use the gym-door entry QR** — the entry-QR live check
  does the same `status = active` lookup, so a paused member's QR (if they
  still had one from before) is rejected at the scanner.
- No separate "block while paused" logic was needed for either of these —
  both gates already checked `status === active` specifically (not just "is
  the period unexpired"), so pausing falls straight into the existing rule.

## How the date shift works

`MemberSubscription` gained one column: `paused_at` (nullable timestamp).

- **Pause**: `status → paused`, `paused_at = now()`.
- **Resume**: compute whole days between `paused_at` and now, add that many
  days onto `current_period_end`, `status → active`, `paused_at = null`.

Day-granularity matches `current_period_end`'s column type (`date`, no time
component) — a pause of a few hours rounds to whole days.

## Who can call it, and how it's scoped

Two ways to trigger the same underlying pause/resume:

| Caller | Endpoint | Scope check |
|---|---|---|
| Member (self) | `PATCH /subscriptions/me/:id/pause` / `.../resume` | Must own the subscription (`subscription.member_id === jwt.sub`) — 404 otherwise |
| Staff (`org_admin`, `gym_manager`) | `PATCH /subscriptions/:id/pause` / `.../resume` | Existing gym-scope check (`findOne` → `scopedGymIds`) |

Both paths call the same private `applyPause()` / `applyResume()` service
methods — one pause/resume behavior, two authorization entry points. There's
no difference in the resulting state depending on who triggered it.

## What was NOT added (and why)

- **No cooldown / max-pauses-per-year limit.** Not requested; a gym could
  reasonably want this as a business rule later, but there's no signal yet
  of what the limit should be. Add it if abuse becomes a real problem.
- **No pause reason / scheduled future pause.** The existing member-status
  pause (`PATCH /members/:id/status`) already supports staff scheduling a
  future pause window with dates — that's a different concept (the member's
  overall account status, not a specific gym subscription) and wasn't
  touched here.
- **No email/push notification on pause/resume.** Nothing in
  `NotificationsService` fires for this yet — same as the existing
  staff-triggered pause, which never notified either. Add a `notify()` call
  if the product wants a confirmation email.

## Files touched

- `src/subscriptions/entities/member-subscription.entity.ts` — added `paused_at`
- `src/subscriptions/subscriptions.service.ts` — `applyPause()`/`applyResume()` shared logic, `pauseMine()`/`resumeMine()`, `findOwnedByMember()`
- `src/subscriptions/subscriptions.controller.ts` — `PATCH /subscriptions/me/:id/pause` and `.../resume`
- `CLAUDE.md` — endpoint table + architectural decision entry
