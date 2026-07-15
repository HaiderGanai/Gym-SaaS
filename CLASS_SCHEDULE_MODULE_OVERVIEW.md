# Class Schedule Module — Overview (the *why*)

Companion to `CLASS_SCHEDULE_POSTMAN_ENDPOINTS.md` (the *how to test*). This covers `ClassScheduleModule` — recurring class templates and the bookable slot instances they generate. It is the foundation the upcoming `BookingsModule` sits on: bookings reference slots, never templates.

## The two-level model

```
SlotTemplate  (the recurring pattern — "Yoga, Mon/Wed/Fri 9:00, 12 spots")
   └── Slot   (a concrete dated instance — "Yoga, Mon 20 Jul 09:00–10:00")
          └── Booking (BookingsModule, next up — members book slots)
```

- **SlotTemplate** holds the recurrence rule (`rrule`, RFC 5545), duration, capacity, instructor, and the booking rules (`booking_window_hours`, `cancellation_cutoff_hours`).
- **Slot** is what members see and book. Every slot carries its **own copy** of capacity, instructor and booking rules — snapshotted from the template at generation time — so a single occurrence can be edited without touching its siblings, and one-off slots (no template) work identically.

## RRULE + materialization, not on-the-fly expansion

Recurrence is stored as a standard RFC 5545 string (expanded with the `rrule` npm package) and **materialized into real slot rows** ahead of time, rather than computed per request:

- Creating a template immediately generates slots for the next **30 days** (override with `generate_until`, max 366 days ahead).
- A daily **2:00 AM cron** (`horizonCron`) tops up every active template so the rolling 30-day window stays filled.
- `POST /schedule/templates/:id/generate` extends the window manually (e.g. open bookings 3 months out).

Generation is **idempotent** — an occurrence whose `starts_at` already exists for the template is skipped, so re-running never duplicates. It also **skips instructor conflicts**: if the instructor already has an enabled slot overlapping an occurrence, that occurrence is not created (reported as `skipped_conflicts`).

The rrule string **must include `DTSTART`** (UTC recommended) — that's where the time-of-day comes from:

```
DTSTART:20260720T090000Z
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
```

## Design choices worth knowing

**"This occurrence only" vs "all future occurrences" (UX brief 4.6).**
`PATCH /schedule/slots/:id` edits one instance and never touches the template. `PATCH /schedule/templates/:id` with `apply_to_future: true` propagates to future slots of the template: non-timing edits (capacity, instructor, name, location, booking rules) are pushed onto future slots directly — except capacity is never shrunk below a slot's current `booking_count` (those slots are skipped and counted in `capacity_conflicts`). Timing edits (`rrule` / `duration_minutes`) instead **delete future empty slots and regenerate**; slots that already have bookings are kept as-is (`booked_slots_kept`) so nobody's booking silently moves.

**Disable ≠ delete ≠ full (UX brief 4.6/4.7).**
- **Disable** (`PATCH /slots/:id/disable`): slot stays on record with its bookings, disappears from the member browse, and every confirmed/waitlisted member is emailed a cancellation notice (best-effort — a dead mailbox doesn't undo the disable). Response reports `affected_bookings` + `members_notified`.
- **Delete** (`DELETE /slots/:id`): hard delete, only allowed when the slot has zero bookings — otherwise a 409 tells you to disable instead.
- **Full** is not a status at all — it's derived (`booking_count >= capacity`) so the UI can distinguish "full" from "disabled".

**Capacity can never drop below bookings.**
Slot edits with `capacity < booking_count` are rejected with a 409 naming the current count (the brief's "conflict warning" state).

**Instructor double-booking is blocked.**
One-off slot creation and slot edits run an overlap check against the instructor's other enabled slots and 409 with the clashing class. Template generation does the same check in memory (one query per run) and skips clashes instead of failing the whole batch.

**Members never see disabled slots** (product decision from the brief's open questions — hidden, not "visible but unbookable"). `GET /schedule/slots/browse` (member JWT) returns only enabled future slots in the member's gyms, each annotated with computed booking metadata: `spots_remaining`, `is_full`, `booking_opens_at` (starts_at − booking window), `cancellation_cutoff_at`, and `booking_open`. **Enforcement** of those windows happens in BookingsModule — this endpoint just tells the app what to render.

**Booking rules live on the slot, not the template.**
`booking_window_hours` (how far in advance booking opens) and `cancellation_cutoff_hours` are snapshotted per slot. BookingsModule will read them off the slot with zero joins, and one-off slots need no special-casing.

**Templates deactivate, never hard-delete.**
`DELETE /schedule/templates/:id` sets `is_active = false`, removes future **empty** slots, and keeps booked ones. Deactivated templates are excluded from the cron.

**Scoping is the house pattern.**
Same `scopedGymIds()` / `assertGymAccess()` helpers as every other module: super_admin sees all, org_admin their org's gyms, gym_manager/front_desk their assigned gyms. Templates and slot management are org_admin + gym_manager; slot/template *reading* is any staff (front desk needs the day's schedule). Instructors must be active staff of the same organization as the gym.

## Entities touched

| Entity | Change |
|---|---|
| `SlotTemplate` | + `duration_minutes` (occurrence length; rrule only gives start times) |
| `Slot` | + `booking_window_hours`, `cancellation_cutoff_hours` (snapshots) |

Both are added by TypeORM `synchronize` in dev; production needs a migration.

## What's deliberately NOT here

- **Booking/waitlist/check-in logic** — BookingsModule (next). `Slot.booking_count` exists and is displayed, but only BookingsModule will increment it.
- **Room/facility conflict checks** — only instructor conflicts are checked; `location` is a free-text label.
- **Timezones** — everything is UTC; the frontend localizes. Gyms spanning DST changes will see fixed-UTC class times drift by an hour across the transition (known ceiling — revisit with per-gym timezone if it bites).
- **Push notifications on disable** — email only until CommunicationModule grows a PushService.
