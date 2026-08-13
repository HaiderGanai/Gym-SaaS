# Membership Pause/Resume — Postman Testing Guide

Base URL: `http://localhost:3000/api/v1`

Prereqs: a member with an **active** subscription at a gym (see
`MEMBER_BILLING_POSTMAN_ENDPOINTS.md` to create one).

Login: **POST** `/auth/member/login` → `{{member_token}}`. For the staff
variants: **POST** `/auth/staff/login` (org_admin or gym_manager) →
`{{admin_token}}`.

---

## 1. Member self-service (MemberJwt)

### Find your subscription id
**GET** `/subscriptions/me` — `Bearer {{member_token}}`

No body. Returns the member's subscriptions with plan detail — copy the
`id` of the active one as `{{sub_id}}`.

### Pause
**PATCH** `/subscriptions/me/{{sub_id}}/pause` — `Bearer {{member_token}}`

No body.

Response `200`:
```json
{
  "id": "{{sub_id}}",
  "status": "paused",
  "paused_at": "2026-08-13T10:00:00.000Z",
  "current_period_start": "2026-08-06",
  "current_period_end": "2026-09-06",
  "...": "..."
}
```

Errors:
- `400` — `Only active subscriptions can be paused (current: <status>)` if it's already paused/cancelled/past_due.
- `404` — subscription doesn't exist, or belongs to a different member.

While paused, `POST /bookings` and `GET /members/me/entry-qr` (and any
scan of a previously-issued entry QR) are rejected — no active subscription.

### Resume
**PATCH** `/subscriptions/me/{{sub_id}}/resume` — `Bearer {{member_token}}`

No body.

Response `200` — note `current_period_end` shifted forward by the days
spent paused:
```json
{
  "id": "{{sub_id}}",
  "status": "active",
  "paused_at": null,
  "current_period_start": "2026-08-06",
  "current_period_end": "2026-09-13",
  "...": "..."
}
```

Errors:
- `400` — `Only paused subscriptions can be resumed (current: <status>)`.
- `404` — same as pause.

---

## 2. Staff-triggered (StaffJwt, org_admin / gym_manager)

Same behavior, gym-scoped instead of ownership-scoped — for front-desk use
when a member calls in or asks in person.

### Pause
**PATCH** `/subscriptions/{{sub_id}}/pause` — `Bearer {{admin_token}}`

No body. Same response/error shape as the member endpoint above.

### Resume
**PATCH** `/subscriptions/{{sub_id}}/resume` — `Bearer {{admin_token}}`

No body. Same date-shift behavior as the member endpoint above.

---

## 3. Quick end-to-end check

1. `POST /auth/member/login` → `{{member_token}}`
2. `GET /subscriptions/me` → note `current_period_end` (e.g. `2026-09-06`) and `{{sub_id}}`
3. `PATCH /subscriptions/me/{{sub_id}}/pause` → `status: "paused"`
4. Try `GET /schedule/slots/browse` + `POST /bookings` with any slot → confirm booking is rejected (`403`, "active subscription ... required")
5. Wait (or manually edit `paused_at` in the DB further back to simulate elapsed days)
6. `PATCH /subscriptions/me/{{sub_id}}/resume` → confirm `current_period_end` moved forward by the paused day count, `status: "active"`
7. Retry the booking from step 4 → now succeeds
