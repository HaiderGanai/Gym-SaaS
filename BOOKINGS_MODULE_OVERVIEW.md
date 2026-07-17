# BookingsModule — How It Works Inside

Class bookings, waitlist, class check-in QR, and the gym-door entry QR. This is the
module that finally *consumes* what ClassScheduleModule materializes: members book
slots, staff scan codes at the door.

Base URL prefix: `/api/v1`. Endpoint bodies and example responses live in
`BOOKINGS_POSTMAN_ENDPOINTS.md`.

---

## 1. The mental model

```
SlotTemplate ──materializes──▶ Slot ◀──────── Booking ────────▶ Member
                              (capacity,      (confirmed /       │
                               booking_count)  waitlisted / …)   │
                                                                 │
MemberSubscription ◀── gate: must be ACTIVE at the slot's gym ───┘
```

- A **Booking** ties one member to one slot. Its `status` walks a small state machine:

```
            book (spot free)          scan class QR
  ────────▶ confirmed ──────────────▶ checked_in
  │              │ ▲                       (terminal)
  │       cancel │ │ promotion
  │              ▼ │
  └───────▶ waitlisted ──cancel──▶ cancelled (terminal)
  book (full)                          ▲
            confirmed ──no-show────────┘── no_show (terminal, staff-set after start)
```

- `Slot.booking_count` counts **confirmed** bookings only (waitlisted people don't
  hold a spot). This module owns every increment/decrement of it; the schedule
  module only reads it (`spots_remaining`, `is_full`).

---

## 2. Who can book — the gates, in order

`POST /bookings` runs these checks top to bottom; the first one that fails is the
error you get back:

| # | Gate | Failure |
|---|------|---------|
| 1 | Member `status` is `active` (from the JWT) | 403 "Your membership is paused/…" |
| 2 | Slot exists and is `enabled` | 404 (disabled slots are invisible to members, same as browse) |
| 3 | Slot's gym is in the member's `gym_ids` | 403 |
| 4 | Class hasn't started yet | 400 |
| 5 | Booking window is open (`now >= starts_at − booking_window_hours`) | 400 with the exact open time |
| 6 | Member has an **active subscription at that gym** — `status = active` and `current_period_end >= today` (no start check: an early renewal moves the whole window forward while the member is still paid up) | 403 "An active subscription at this gym is required" |
| 7 | Class-pack/PAYG credits left (see §4) | 403 with used/total counts |
| 8 | No existing non-cancelled booking for this slot | 409 |
| 9 | No overlapping confirmed/waitlisted booking (you can't be in two classes at once) | 409 naming the clashing class |
| 10 | Capacity | not an error — full class → waitlist (§3) |

**The subscription gate is the money link.** `past_due` and `paused` subscriptions
block booking, which is exactly the front-desk collection lever the manual-billing
flow relies on: settle the invoice → sub re-activates → booking works again.

**Race safety on capacity:** the spot is claimed with a single atomic SQL update —
`SET booking_count = booking_count + 1 WHERE id = ? AND booking_count < capacity`.
Two members grabbing the last spot at the same instant can't both win; the loser
falls through to the waitlist.

---

## 3. Waitlist

- Booking a full class creates the booking with `status = waitlisted` and
  `waitlist_position = (current waitlisted count) + 1`. No QR is issued yet.
- When a **confirmed** booking is cancelled (by the member in time, or by staff),
  the freed spot goes to the **first waitlisted** booking (lowest position, then
  earliest created): it flips to `confirmed`, gets its QR token, and the member is
  emailed ("A spot opened up"). `booking_count` doesn't move — the spot changed
  hands, it didn't free up.
- If nobody is waitlisted (or the slot is disabled/past), `booking_count` is
  decremented instead.
- Waitlisted members can cancel any time (no cutoff — leaving a queue hurts nobody).
- Positions are not renumbered after someone leaves the queue; promotion always
  takes the lowest remaining position, so gaps are harmless.

## 3b. Cancellation

- **Member cancel** (`PATCH /bookings/:id/cancel`) respects the slot's
  `cancellation_cutoff_hours`: allowed until `starts_at − cutoff`, then 403
  ("ask the front desk").
- **Staff cancel** (`PATCH /bookings/:id/staff-cancel`) ignores the cutoff —
  that's the front-desk override for phone-ins and emergencies. Same promotion
  logic runs.
- Cancelling sets `cancelled_at`; the row stays forever (attendance history).

---

## 4. Plan types and credits

| Plan type | Booking allowance |
|---|---|
| `monthly` / `weekly` / `yearly` | Unlimited (capacity and one-per-slot are the only limits) |
| `class_pack` / `payg` with `included_credits` set | One credit per booking |

Credit accounting is **derived, not stored**: used credits = count of the member's
non-cancelled bookings at that gym created during the current subscription period.
That means:

- Cancelling a booking (in time) automatically refunds the credit — the row flips
  to `cancelled` and simply stops counting.
- No-shows and check-ins still count (you used the spot).
- Renewal starts a fresh period → fresh credits.
- There is no counter column to drift out of sync.

---

## 5. The two QR codes

Both are signed JWTs (same `JWT_SECRET` as logins). **Different `typ` claims — an
entry code can never be replayed as a class code or vice versa.**

### Class/booking QR (per booking)

- Issued when a booking becomes `confirmed` (at booking time, or at waitlist
  promotion). Stored on the row as `qr_token` and returned in `/bookings/me`.
- Payload: `{ typ: 'booking', booking_id, member_id, slot_id }`, **expires when the
  slot ends** — a screenshot leaked after class is worthless.
- Scanned via `POST /checkin/booking`. Deny reasons: invalid/expired token, booking
  not found, class cancelled (slot disabled), already checked in, booking is
  waitlisted/cancelled, class already ended. Success marks `checked_in` +
  `checked_in_at`.

### Gym-door entry QR (per subscription)

- Fetched on demand: `GET /members/me/entry-qr` (optionally `?gym_id=` — defaults
  to the primary gym). **Never stored** — the app refetches it when the member
  opens the QR screen.
- Requires an active subscription at that gym; otherwise 403 "renew your
  membership". So the app literally cannot display an entry code without a live
  subscription.
- Payload: `{ typ: 'entry', member_id, gym_id }`, **expires at the subscription's
  `current_period_end`** (end of day, UTC) — the code on the phone dies with the
  subscription even offline.
- Scanned via `POST /checkin/entry`. After signature+expiry, the server does **one
  live DB check** that the subscription is still active. This is what revokes
  pause/cancel *mid-period*: the old token's signature is still valid, but the live
  check denies with the reason ("Subscription is paused", "period ended …").
- Renewal needs no re-issue dance: front desk renews → the next fetch just works.

**Lifecycle in one line:** subscription starts → QR fetchable, valid to period end
→ expires/pauses/cancels → fetch 403s and saved copies fail the live check →
renewal → works again immediately.

### Why scans return `200 { allowed: false, reason }` instead of HTTP errors

The scanner UI needs green/red + a reason, not exception handling. Only real access
violations throw (staff scanning for a gym outside their scope → 403). Invalid
tokens, expired subs, double check-ins are all `allowed: false` with a
human-readable `reason`, plus member name/photo where known so front desk sees who
is standing there.

---

## 6. Staff surface

- `GET /bookings` — scoped list (same gym-scoping rules as every module:
  super_admin all, org_admin own org, gym_manager/front_desk assigned gyms), with
  `?gym_id= ?slot_id= ?member_id= ?status=` filters. `?slot_id=` is the class
  roster.
- `PATCH /bookings/:id/staff-cancel` — cutoff-free cancel (runs promotion).
- `PATCH /bookings/:id/no-show` — confirmed → no_show, only after the class has
  started. The count keeps the spot as used (it was).
- `POST /checkin/booking`, `POST /checkin/entry` — scan endpoints.

No `@Roles` on any of these: all four staff roles may operate bookings for their
gyms (front desk is the primary user); gym scoping in the service is the real
fence.

---

## 7. Design decisions worth remembering

- **No unique DB constraint on (slot, member)** — cancelled rows must not block
  rebooking, and a partial unique index isn't expressible through TypeORM
  synchronize. The duplicate check is a pre-query; the atomic capacity claim is
  what actually guards overselling.
- **QR expiry mirrors the real-world validity** of the thing it grants: class code
  dies with the class, entry code dies with the paid period.
- **Entry scan trusts the DB, not the token** for anything revocable. The token
  proves identity + intent cheaply; the subscription row decides.
- **`booking_count` = confirmed only.** Waitlist size is queryable but never
  blocks capacity math.
- **Emails are best-effort** (waitlist promotion): a dead mailbox never undoes a
  promotion, same pattern as slot-disable notifications.
- Enforcement of `booking_window_hours` / `cancellation_cutoff_hours` reads the
  values **off the slot row** (snapshotted from the template), so per-occurrence
  edits behave correctly.
