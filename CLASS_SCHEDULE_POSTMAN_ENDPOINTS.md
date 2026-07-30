# Class Schedule — Postman Testing Guide

End-to-end flow: create a recurring template (slots auto-generate) → browse the calendar → tweak single occurrences → disable/enable → member browses bookable slots.

Base URL: `http://localhost:4000/api/v1`

Prereqs: an **active** org, at least one gym, an active staff user to act as instructor (any role works — use the gym_manager's ID), and a member with access to the gym (only for the browse endpoint). Dev seed: org_admin `owner@test.com` / `Test1234!`, gym `2e82ea95-3c50-48bf-93a1-251b7b807cd3`.

Login first — **POST** `/auth/staff/login` → save as `{{admin_token}}`. For the member browse call, **POST** `/auth/member/login` → `{{member_token}}`.

> All datetimes are UTC ISO strings. The `rrule` field **must include a `DTSTART` line** — that's where the class start time comes from.

---

## 1. Templates (org_admin, gym_manager)

### Create a recurring template
**POST** `/schedule/templates` — `Bearer {{admin_token}}`
```json
{
  "gym_id": "{{gym_id}}",
  "instructor_id": "{{staff_id}}",
  "activity_name": "Morning Yoga",
  "location": "Studio A",
  "capacity": 12,
  "duration_minutes": 60,
  "rrule": "DTSTART:20260720T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
  "booking_window_hours": 48,
  "cancellation_cutoff_hours": 2
}
```
Response: the template **plus** the slots materialized for the next 30 days:
```json
{ "template": { "id": "..." }, "created": 13, "skipped_existing": 0, "skipped_conflicts": 0,
  "generated_until": "2026-08-14T09:00:00.000Z", "future_slots": 13 }
```
→ save `template.id` as `{{template_id}}`.

Optional: `generate_until` (ISO date) to materialize further ahead right away (max 366 days).

More rrule examples:
| Pattern | rrule |
|---|---|
| Every day at 07:00 | `DTSTART:20260720T070000Z\nRRULE:FREQ=DAILY` |
| Tue+Thu at 18:30 | `DTSTART:20260721T183000Z\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH` |
| 1st of each month 10:00 | `DTSTART:20260801T100000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1` |
| Weekly, 10 sessions only | `DTSTART:20260720T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10` |

### List / read (any staff)
| Method | URL | Notes |
|---|---|---|
| GET | `/schedule/templates` | scoped to your gyms; `?gym_id=...`, `?include_inactive=true` |
| GET | `/schedule/templates/{{template_id}}` | single template with instructor |

### Update — template only vs. all future occurrences
**PATCH** `/schedule/templates/{{template_id}}` — `Bearer {{admin_token}}`

Template only (existing slots untouched):
```json
{ "capacity": 15 }
```

Propagate to future slots ("all future occurrences"):
```json
{ "capacity": 15, "apply_to_future": true }
```
→ `{ "template": {...}, "slots_updated": 12, "capacity_conflicts": 0 }`
(`capacity_conflicts` = future slots skipped because they already have more bookings than the new capacity.)

Changing the timing (`rrule` / `duration_minutes`) with `apply_to_future: true` deletes future **empty** slots and regenerates; booked slots are kept:
```json
{
  "rrule": "DTSTART:20260720T100000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
  "apply_to_future": true
}
```
→ `{ "template": {...}, "slots_removed": 10, "booked_slots_kept": 2, "created": 12, ... }`

### Extend the generated window
There is no separate `/generate` endpoint — send `generate_until` on the same **PATCH** used for every other template edit:

**PATCH** `/schedule/templates/{{template_id}}` — `Bearer {{admin_token}}`
```json
{ "generate_until": "2026-10-01" }
```
→ `{ "template": {...}, "created": 27, "skipped_existing": 13, "skipped_conflicts": 0, "generated_until": "2026-10-12T09:00:00.000Z", "future_slots": 40 }` — idempotent, safe to re-run.

Combine it with other fields in one call if needed — e.g. bump capacity **and** extend the window together:
```json
{ "capacity": 15, "apply_to_future": true, "generate_until": "2026-10-01" }
```

`generated_until` = latest materialized occurrence (how far out the schedule currently extends); `future_slots` = upcoming slot count. Both computed fields are also on every template in `GET /schedule/templates` and `GET /schedule/templates/:id`, so the frontend always knows the current window without querying slots.

(A daily 2:00 AM cron keeps every active template materialized 30 days out automatically.)

### Deactivate (soft delete)
**DELETE** `/schedule/templates/{{template_id}}`
```json
{ "message": "Template deactivated. Future empty slots removed; slots with bookings were kept.", "slots_removed": 12, "booked_slots_kept": 1 }
```

---

## 2. Slots

### One-off custom slot (org_admin, gym_manager)
**POST** `/schedule/slots` — `Bearer {{admin_token}}`
```json
{
  "gym_id": "{{gym_id}}",
  "instructor_id": "{{staff_id}}",
  "activity_name": "Boxing Masterclass",
  "location": "Main Floor",
  "starts_at": "2026-07-25T17:00:00Z",
  "ends_at": "2026-07-25T18:30:00Z",
  "capacity": 20
}
```
409 if the instructor already has an overlapping enabled slot (response names the clashing class). Optional: `booking_window_hours` (default 24), `cancellation_cutoff_hours` (default 2).
→ save `id` as `{{slot_id}}`.

### Calendar view (any staff)
**GET** `/schedule/slots?gym_id={{gym_id}}&from=2026-07-20&to=2026-07-27` — `Bearer {{admin_token}}`

All filters optional: `gym_id`, `from`, `to` (default: today → +30 days), `status` (`enabled`|`disabled`), `template_id`. Ordered by `starts_at`.

### Slot detail + roster preview (any staff)
**GET** `/schedule/slots/{{slot_id}}`

Returns the slot with `bookings[]` (status, waitlist position, check-in time, member name/email) — the live-roster data source.

### Edit one occurrence only (org_admin, gym_manager)
**PATCH** `/schedule/slots/{{slot_id}}`
```json
{ "capacity": 15, "starts_at": "2026-07-25T18:00:00Z", "ends_at": "2026-07-25T19:00:00Z" }
```
- 409 if `capacity` < current `booking_count`
- 409 if the new time/instructor overlaps another enabled slot of that instructor
- Never touches the template or sibling occurrences

### Disable / enable (org_admin, gym_manager)
**PATCH** `/schedule/slots/{{slot_id}}/disable`
```json
{ "message": "Slot disabled.", "affected_bookings": 3, "members_notified": 3 }
```
Every confirmed/waitlisted member gets a cancellation email. Bookings stay on record. The slot vanishes from the member browse.

**PATCH** `/schedule/slots/{{slot_id}}/enable`
```json
{ "message": "Slot enabled." }
```

### Delete (org_admin, gym_manager)
**DELETE** `/schedule/slots/{{slot_id}}` — only if the slot has **zero** bookings, otherwise:
```json
{ "statusCode": 409, "message": "Slot has bookings — disable it instead of deleting" }
```

---

## 3. Member browse (member token)

**GET** `/schedule/slots/browse` — `Bearer {{member_token}}`

Optional: `?gym_id=...` (must be one of the member's gyms), `?from=`, `?to=` (default: now → +30 days). Only **enabled, future** slots in the member's gyms; disabled slots are hidden entirely. Each slot is annotated:

```json
{
  "activity_name": "Morning Yoga",
  "starts_at": "2026-07-22T09:00:00.000Z",
  "capacity": 12,
  "booking_count": 12,
  "spots_remaining": 0,
  "is_full": true,
  "booking_opens_at": "2026-07-20T09:00:00.000Z",
  "cancellation_cutoff_at": "2026-07-22T07:00:00.000Z",
  "booking_open": true
}
```

UI mapping: `is_full` → show "Join Waitlist"; `booking_open: false` → disabled button ("opens {booking_opens_at}"). Enforcement of these windows lands in BookingsModule.

---

## Quick test sequence

1. Staff login → create template with a `DTSTART` a few days out → confirm `created` > 0.
2. `GET /schedule/slots?template_id=...` → see the generated instances.
3. `PATCH` one slot's capacity → then `PATCH` the template with `apply_to_future: true` → verify the single-edited slot behavior.
4. Create a one-off slot overlapping one of the generated ones (same instructor) → expect 409.
5. Disable a slot → member `GET /schedule/slots/browse` → it's gone; enable → it's back.
6. `DELETE` the template → future slots gone, template `is_active: false`.
