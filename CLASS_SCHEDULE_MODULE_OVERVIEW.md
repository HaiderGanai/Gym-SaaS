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

## How templates and slots relate (and when you need which)

**A template is a factory; a slot is the product.** The template stores the *pattern* ("Yoga every Mon/Wed/Fri at 9:00, 60 min, 12 spots"); the system stamps out concrete `Slot` rows from it. After a slot is created it is **self-sufficient** — it carries its own copy of every operational field, so it keeps working even if its template is later edited or deactivated.

**A template is NOT required to create a slot.** `Slot.template_id` is nullable:

| You want | Use | template involved? |
|---|---|---|
| A class that repeats (weekly yoga, daily HIIT) | `POST /schedule/templates` | yes — slots are generated from it |
| A single event (one-off masterclass, workshop) | `POST /schedule/slots` | no — `template_id` stays `NULL` |

Both kinds of slot behave identically afterwards: same calendar, same member browse, same disable/enable, same (future) booking rules — the only difference is that template-born slots are also reachable via `?template_id=` filtering and are touched by `apply_to_future` template edits and the nightly top-up cron.

**Direction of dependence:** slots depend on templates only at *birth* (field values are copied over once). Templates never depend on slots. Members and bookings only ever see slots — a member cannot book "a template".

## Field-by-field reference

### `SlotTemplate` (`slot_templates` table) — the recurring pattern

| Field | Type / default | What it means |
|---|---|---|
| `id` | uuid, PK | Auto-generated identifier. |
| `gym_id` → `gym` | uuid, FK to `gyms` | Which branch this recurring class belongs to. Drives all staff scoping (org_admin sees own org's gyms, gym_manager only assigned gyms). |
| `instructor_id` → `instructor` | uuid, FK to `staff_users` | Who teaches it. Must be an **active** staff user of the **same organization** as the gym (validated on create/update). Used for the double-booking overlap check. |
| `activity_name` | string | Display name of the class ("Morning Yoga"). Copied onto every generated slot. |
| `location` | string, nullable | Free-text room/area label ("Studio A"). Informational only — no room-conflict checking. |
| `capacity` | int | Max bookable spots per occurrence. Copied onto each slot; each slot can then diverge. |
| `rrule` | string | Full RFC 5545 recurrence rule, **must include a `DTSTART` line** (UTC) — `DTSTART` provides the date the pattern starts *and* the time-of-day of every occurrence. Example: `DTSTART:20260720T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR`. |
| `duration_minutes` | int, default 60 | How long each occurrence runs. The rrule only yields *start* instants; each slot's `ends_at` = start + this. |
| `booking_window_hours` | int, default 24 | How far **in advance** members may book: booking opens at `starts_at − window`. Copied onto each slot. |
| `cancellation_cutoff_hours` | int, default 2 | Members may cancel until `starts_at − cutoff`. Copied onto each slot. (Both windows are *enforced* by BookingsModule; here they're stored and surfaced.) |
| `is_active` | bool, default true | Soft-delete flag. `DELETE /schedule/templates/:id` sets it false — the row is kept, the nightly cron skips it, and no new slots are generated. |
| `created_at` | timestamp | Row creation time. |
| `slots` | relation | All slot instances ever generated from this template. |

### `Slot` (`slots` table) — one concrete, bookable session

| Field | Type / default | What it means |
|---|---|---|
| `id` | uuid, PK | Auto-generated identifier. This is what bookings reference. |
| `template_id` → `template` | uuid, FK, **nullable** | The template that generated it — or `NULL` for a one-off slot created directly via `POST /schedule/slots`. Also the idempotency key together with `starts_at` (generation never creates a second slot with the same template + start time). |
| `gym_id` → `gym` | uuid, FK | Branch the session happens at. Copied from the template (or given directly for one-offs). |
| `instructor_id` → `instructor` | uuid, FK | Who teaches *this* occurrence. Starts as the template's instructor but can be changed per-slot (substitute teacher) — the overlap check then runs against the new instructor's other enabled slots. |
| `activity_name` | string | Class name shown on the calendar and member app. Editable per-slot. |
| `location` | string, nullable | Room/area label for this occurrence. |
| `starts_at` | timestamp (UTC) | When this session starts. From the rrule occurrence, or given directly for one-offs. |
| `ends_at` | timestamp (UTC) | When it ends: `starts_at + duration_minutes` for generated slots, given explicitly for one-offs. Must be after `starts_at`. |
| `capacity` | int | Max spots for **this** occurrence. Can never be set below the current `booking_count` (409). |
| `booking_count` | int, default 0 | Live count of active bookings. **Owned by BookingsModule** — this module only reads it (for `spots_remaining`, `is_full`, capacity guards). Nothing here increments it. |
| `booking_window_hours` | int, default 24 | Snapshot of the template value at generation time (or per-slot value for one-offs). Lives on the slot so booking rules are read with zero joins and template edits don't retroactively change already-published sessions unless you ask (`apply_to_future`). |
| `cancellation_cutoff_hours` | int, default 2 | Same snapshot logic as above. |
| `status` | enum `enabled` / `disabled`, default `enabled` | `enabled` = visible & bookable to members. `disabled` = hidden from member browse, bookings kept on record, booked members emailed. **Disabled ≠ full ≠ deleted** — "full" is derived (`booking_count >= capacity`), never a status. |
| `created_at` | timestamp | Row creation time. |
| `bookings` | relation | All bookings against this slot (the staff roster preview in `GET /schedule/slots/:id`). |

### Why some fields exist on *both*

`activity_name`, `location`, `capacity`, `instructor_id`, `booking_window_hours`, `cancellation_cutoff_hours` appear on both entities on purpose. The template holds the **defaults for future occurrences**; each slot holds the **actual values for that one session**. That's what makes "this occurrence only" edits (PATCH one slot) and "all future occurrences" edits (PATCH template with `apply_to_future: true`) two cleanly separated operations — and what lets one-off slots exist without any template at all.

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

### What `POST /schedule/templates/:id/generate` actually does (and why the template "doesn't change")

This endpoint **never modifies the template row**. Looking at the template after calling it will always show zero difference — that's expected, not a bug. What it does is create **Slot rows**: it expands the template's rrule from *now* until the `until` date you send, and inserts a slot for every occurrence that doesn't already exist.

```
POST /schedule/templates/:id/generate
{ "until": "2026-10-15" }        ← extend the bookable window out to this date
```

The response tells you exactly what happened:

| Field | Meaning |
|---|---|
| `created` | New slot rows inserted. |
| `skipped_existing` | Occurrences that already had a slot (idempotency — re-running is always safe). |
| `skipped_conflicts` | Occurrences dropped because the instructor already has an overlapping enabled slot. |

Three common "nothing happened" cases:

1. **`until` is within the already-materialized window.** Template creation + the nightly cron already keep 30 days materialized. If you send `until` ≤ ~30 days out, every occurrence already exists → `created: 0, skipped_existing: N`. To see new rows, send an `until` **beyond** the current window (up to 366 days ahead).
2. **You looked at the template, not the slots.** Verify with `GET /schedule/slots?template_id=<id>&from=<today>&to=<until>` — the new occurrences are there.
3. **The rrule simply has no occurrences in that range** (e.g. `UNTIL`/`COUNT` inside the rrule already ended) → `created: 0` legitimately.

There is deliberately no `generated_until` column on the template — the materialized window *is* the slot rows; query them to see how far out the schedule extends.

## RRULE anatomy — what the frontend needs to build

The `rrule` field is a standard **RFC 5545** recurrence string (same format Google Calendar uses). It is always **two lines** joined with `\n`:

```
DTSTART:20260720T090000Z
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
```

**Line 1 — `DTSTART` (required, we reject rules without it):**
`DTSTART:YYYYMMDDTHHMMSSZ` — UTC, no dashes/colons in the value. It carries **two things at once**: the date the pattern begins *and* the time-of-day of every occurrence. `20260720T090000Z` = pattern starts 20 Jul 2026, every class runs at 09:00 UTC. The class *length* is NOT here — it comes from the template's `duration_minutes`.

**Line 2 — `RRULE`:** semicolon-separated `KEY=VALUE` pairs:

| Key | Values | Meaning |
|---|---|---|
| `FREQ` | `DAILY` / `WEEKLY` / `MONTHLY` | The base cadence. `WEEKLY` is the gym workhorse. |
| `BYDAY` | `MO,TU,WE,TH,FR,SA,SU` (comma list) | Which weekdays (with `FREQ=WEEKLY`). |
| `INTERVAL` | integer, default 1 | Every N-th period. `FREQ=WEEKLY;INTERVAL=2` = every other week. |
| `UNTIL` | `YYYYMMDDTHHMMSSZ` | Hard end date for the pattern (optional — omit for "runs forever"). |
| `COUNT` | integer | Alternative to UNTIL: stop after N total occurrences. |

**How the frontend maps a "create class" form onto this string:**

A typical form — activity, start date, time, day-of-week checkboxes, optional end date — converts like this:

1. Combine the **start date + class time** the user picked, convert from the gym's local timezone to **UTC**, format as `YYYYMMDDTHHMMSSZ` → that's `DTSTART`. (e.g. with `date-fns` or `dayjs.utc()`; 09:00 in Berlin summer = `070000Z`.)
2. **Day checkboxes** → `BYDAY=` two-letter codes joined by commas (Mon+Wed+Fri → `MO,WE,FR`).
3. Cadence dropdown ("weekly" / "every 2 weeks" / "daily") → `FREQ=` + optional `INTERVAL=`.
4. Optional "ends on" date → `UNTIL=` in the same UTC format (or leave it off).
5. Join: `` `DTSTART:${dtstart}\nRRULE:FREQ=WEEKLY;BYDAY=${days}` `` — in JSON the `\n` is the literal two characters `\n` inside the string, which is what JSON.stringify produces naturally from a real newline.
6. Class **duration** goes in `duration_minutes`, not in the rrule.

The frontend can also use the same [`rrule` npm package](https://github.com/jkbrzt/rrule) the backend uses: build with `new RRule({ freq: RRule.WEEKLY, byweekday: [RRule.MO, RRule.WE], dtstart })`, call `.toString()`, send the result — guaranteed parseable, and `.all()`/`.between()` gives you a live client-side preview ("this will create classes on: …") before submitting.

**Recipe examples:**

| Schedule | rrule string |
|---|---|
| Mon/Wed/Fri 09:00 UTC, forever | `DTSTART:20260720T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR` |
| Every day 06:30 UTC | `DTSTART:20260720T063000Z\nRRULE:FREQ=DAILY` |
| Sat 10:00 UTC, every other week | `DTSTART:20260725T100000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA` |
| Tue/Thu 18:00 UTC, 8-week course | `DTSTART:20260721T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=16` |

**Timezone caveat (known ceiling):** everything is UTC end-to-end; the frontend converts for display. A class stored at `090000Z` stays at 09:00 *UTC* across a DST change, so its local wall-clock time will shift by an hour — revisit with per-gym timezones if it bites.

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
