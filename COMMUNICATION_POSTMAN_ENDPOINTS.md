# CommunicationModule + NotificationsModule — Postman Endpoints

Base URL (dev): `http://localhost:3000/api/v1`
All requests: `Authorization: Bearer <token>` (member token or staff token as noted)
and `Content-Type: application/json` where a body is sent.

There is nothing to call directly on `CommunicationModule` — it has no
controller. Every route below belongs to `NotificationsModule`.

---

## 1. Register a device token (member app, after login)

**POST** `/notifications/device-token` — Member token

```json
{ "fcm_token": "d7x9Kj2mQ...device-token-from-firebase-sdk..." }
```

**200:**
```json
{ "message": "Device token registered" }
```

Call this once the mobile app has an FCM token (typically right after login).
Without it, push notifications have nowhere to go for that member — email and
the in-app inbox still work regardless.

---

## 2. Clear device token (logout)

**DELETE** `/notifications/device-token` — Member token, no body

**200:**
```json
{ "message": "Device token cleared" }
```

Call this on logout so a shared or reset device doesn't keep receiving another
member's push notifications.

---

## 3. My notification feed

**GET** `/notifications` — Member token
**GET** `/notifications?unread_only=true` — only unread

No body. Returns every `NotificationLog` row for the authenticated member,
newest first.

**200:**
```json
[
  {
    "id": "b1f6c2a0-...",
    "gym_id": "...",
    "member_id": "...",
    "type": "waitlist_promoted",
    "title": "You're in!",
    "body": "A spot opened up in Yoga — you're now confirmed.",
    "data": { "activity_name": "Yoga", "starts_at": "2026-07-24T09:00:00.000Z" },
    "email_status": "sent",
    "push_status": "sent",
    "is_read": false,
    "read_at": null,
    "created_at": "2026-07-22T10:15:00.000Z"
  }
]
```

`type` values in use: `waitlist_promoted`, `slot_disabled`, `invoice_ready`,
`booking_reminder`, `announcement`. `email_status` / `push_status` are each one
of `skipped | sent | failed` (`skipped` = that channel was never attempted —
e.g. no device token registered).

---

## 4. Unread count

**GET** `/notifications/unread-count` — Member token, no body

**200:**
```json
{ "unread_count": 3 }
```

Poll this for a badge on the notification bell/icon.

---

## 5. Mark one notification read

**PATCH** `/notifications/:id/read` — Member token, no body

**200:** the updated notification row (see shape in §3).
**404** if the id doesn't belong to the authenticated member.

---

## 6. Mark all notifications read

**PATCH** `/notifications/read-all` — Member token, no body

**200:**
```json
{ "marked_read": 3 }
```

---

## 7. Staff: broadcast an announcement

**POST** `/communication/broadcast` — Staff token (org_admin or gym_manager)

```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "title": "Closed for maintenance",
  "body": "We'll be closed this Sunday for equipment servicing. Sorry for the inconvenience!"
}
```

Omit `member_ids` to reach every active member of the gym, or target specific
members:

```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "member_ids": ["c2ab992d-8592-4319-ad7a-6f5f837d48a2", "9efef953-ebe4-4b0d-9f8e-f41a3b9c5095"],
  "title": "Your waitlist spot",
  "body": "We're opening an extra Saturday session — want first pick?"
}
```

**200:**
```json
{
  "message": "Announcement sent",
  "targeted": 42,
  "notified": 42
}
```

`targeted` = audience size after resolving `gym_id`/`member_ids`. `notified` =
how many of those sends completed without throwing (a dead mailbox or missing
device token still counts as notified — that's `email_status`/`push_status`
inside each log row, not a broadcast-level failure). Each targeted member gets
an email, a push (if they have a device token), and a row in their
`GET /notifications` feed.

**Errors:** `403` if the staff caller doesn't have access to `gym_id`, or isn't
`org_admin`/`gym_manager`.

---

## What you'll never call directly

- **Waitlist promotion, slot-disabled, invoice-ready, booking-reminder**
  notifications fire automatically from `BookingsService`, `ScheduleService`,
  and `InvoicesService` — there's no manual trigger endpoint for any of them.
  See `COMMUNICATION_MODULE_OVERVIEW.md` §4 for exactly where each one fires.
- The booking-reminder cron runs every 15 minutes on its own — nothing to call
  to test it except waiting, or booking a slot that starts within 2 hours and
  checking `GET /notifications` after the next tick.

---

## Quick test recipe (Postman order)

1. Member login → `POST /notifications/device-token` with any string ≥10 chars
   (a real Firebase project isn't required to exercise email + inbox — push
   will just come back `failed`/`skipped` in the log without one).
2. Staff login → `POST /schedule/slots` a small-capacity slot, or use an
   existing one.
3. Member books it, a second member books the same slot → waitlisted.
4. Staff: `PATCH /bookings/:id/staff-cancel` the first booking → triggers
   `waitlist_promoted` for the second member.
5. Member: `GET /notifications` → see the `waitlist_promoted` row,
   `GET /notifications/unread-count` → `1`.
6. `PATCH /notifications/:id/read` → re-check unread count → `0`.
7. Staff: `POST /communication/broadcast` to the gym → member's feed grows by
   one `announcement` row.
8. Staff: `PATCH /invoices/:id/resend` on an existing invoice → member's feed
   grows by one `invoice_ready` row (email is confirmed sent before this
   returns — a broken mailbox would 500 here instead of silently logging a
   failure).
