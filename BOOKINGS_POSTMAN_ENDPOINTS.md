# BookingsModule — Postman Endpoints

Base URL (dev): `http://localhost:3000/api/v1`
All requests: `Authorization: Bearer <token>` (member token or staff token as noted)
and `Content-Type: application/json` where a body is sent.

---

## 1. Book a class

**POST** `/bookings` — Member token

```json
{
  "slot_id": "161f6beb-4148-4246-94fc-13f1e667bd16"
}
```

**201 — spot available:**
```json
{
  "message": "Booking confirmed",
  "booking": {
    "id": "…",
    "slot_id": "…",
    "member_id": "…",
    "status": "confirmed",
    "waitlist_position": null,
    "qr_token": "eyJhbGciOiJIUzI1NiIs…",
    "checked_in_at": null,
    "cancelled_at": null,
    "created_at": "2026-07-17T12:00:00.000Z",
    "slot": { "id": "…", "activity_name": "Yoga", "starts_at": "…", "ends_at": "…", "capacity": 10, "booking_count": 4 }
  }
}
```

**201 — class full:**
```json
{
  "message": "Class is full — you are on the waitlist (position 2)",
  "booking": { "…": "…", "status": "waitlisted", "waitlist_position": 2, "qr_token": null }
}
```

**Errors:** `403` membership not active / no active subscription at this gym /
no class credits left · `404` slot unknown or disabled · `400` class started or
booking window not open yet · `409` already booked this slot / overlapping booking.

---

## 2. My bookings

**GET** `/bookings/me` — Member token
**GET** `/bookings/me?include_past=true` — include finished + cancelled ones

No body. Returns bookings (each with its `slot`) ordered by class start time.
Default: only upcoming, non-cancelled. The `qr_token` for each confirmed booking
is here — the app renders it as the class check-in QR.

---

## 3. Cancel my booking

**PATCH** `/bookings/:id/cancel` — Member token, no body

**200:**
```json
{ "message": "Booking cancelled", "promoted_from_waitlist": null }
```

**Errors:** `403` past the slot's `cancellation_cutoff_hours` ("ask the front
desk") · `404` not yours / unknown · `409` already cancelled or checked in.
Waitlisted bookings can always be cancelled.

---

## 4. Staff: list bookings

**GET** `/bookings` — Staff token (any role, gym-scoped)

Query params (all optional): `?gym_id=&slot_id=&member_id=&status=`
`status` ∈ `confirmed | waitlisted | checked_in | no_show | cancelled`
`?slot_id=<id>` = the roster for one class. Each row includes minimal `member`
(id, full_name, email) and `slot` info.

---

## 5. Staff: cancel a booking (cutoff-free)

**PATCH** `/bookings/:id/staff-cancel` — Staff token, no body

**200 — with waitlist promotion:**
```json
{
  "message": "Booking cancelled",
  "promoted_from_waitlist": { "booking_id": "…", "member": "Jane Doe" }
}
```
The promoted member is emailed automatically (best-effort).

---

## 6. Staff: mark no-show

**PATCH** `/bookings/:id/no-show` — Staff token, no body

**200:** `{ "message": "Marked as no-show" }`
**Errors:** `400` class hasn't started yet · `409` booking isn't `confirmed`.

---

## 7. Member: gym-door entry QR

**GET** `/members/me/entry-qr` — Member token
**GET** `/members/me/entry-qr?gym_id=<uuid>` — for a non-primary gym

**200:**
```json
{
  "qr_token": "eyJhbGciOiJIUzI1NiIs…",
  "gym_id": "7ce512e2-8b75-4c5b-9bb5-bea3b88a5496",
  "valid_until": "2026-08-16T23:59:59.999Z"
}
```
`valid_until` = subscription `current_period_end`. Render `qr_token` as a QR code.
Refetch on screen open — never cache it.

**403** when there is no active subscription at that gym:
`"No active subscription — renew your membership to get an entry code"`

---

## 8. Staff: scan entry QR (door)

**POST** `/checkin/entry` — Staff token

```json
{ "qr_token": "<scanned string>" }
```

**200 — allowed:**
```json
{
  "allowed": true,
  "member": { "id": "…", "full_name": "Member 1", "email": "…", "photo_url": null, "status": "active" },
  "subscription": { "status": "active", "plan": "Monthly", "period_end": "2026-08-16" }
}
```

**200 — denied (always 200; check `allowed`):**
```json
{ "allowed": false, "reason": "Subscription is paused", "member": { "…": "…" } }
```
Deny reasons: `Invalid or expired code` · `Member not found` ·
`No subscription at this gym` · `Subscription is paused|cancelled|past_due` ·
`Subscription period ended <date>`.
**403** only if the scanning staff has no access to that gym.

---

## 9. Staff: scan class/booking QR

**POST** `/checkin/booking` — Staff token

```json
{ "qr_token": "<scanned string>" }
```

**200 — allowed (marks the booking checked-in):**
```json
{
  "allowed": true,
  "member": { "id": "…", "full_name": "Member 2", "email": "…", "photo_url": null },
  "class": { "activity_name": "Yoga", "starts_at": "…", "location": "Studio 1" },
  "checked_in_at": "2026-07-17T13:55:02.000Z"
}
```

**200 — denied:** `{ "allowed": false, "reason": "…", "member": …, "class": … }`
Reasons: `Invalid or expired code` · `Booking not found` · `Class was cancelled` ·
`Already checked in at <time>` · `Booking is waitlisted|cancelled|no_show` ·
`Class has already ended`.

---

## Quick test recipe (Postman order)

1. Staff login → create a slot (`POST /schedule/slots`) with small `capacity`.
2. Member login → `POST /bookings` → get `qr_token`.
3. Second member books the same slot → waitlisted.
4. `PATCH /bookings/:id/staff-cancel` the first booking → second member promoted.
5. `POST /checkin/booking` with the promoted member's token → `allowed: true`.
6. `GET /members/me/entry-qr` → `POST /checkin/entry` → `allowed: true`.
7. `PATCH /subscriptions/:id/pause` → repeat step 6 → fetch 403s, old token scans `allowed: false`.
