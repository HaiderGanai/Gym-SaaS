# Attendance & Desk QR — Postman Endpoints

Base URL: `http://localhost:3000/api/v1` (dev). See `ATTENDANCE_MODULE_OVERVIEW.md` for the design rationale.

---

## `GET /gyms/:id/qr`

**Auth:** StaffJwt, `Roles(org_admin, gym_manager)`

Fetches the gym's static, printable entry QR. Same token every time it's called — this is not a rotating/one-time code.

**Response `200`:**
```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "gym_name": "Downtown Branch",
  "qr_token": "eyJhbGciOi...",
  "qr_image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA..."
}
```

`qr_image` is ready to render directly (`<img src="...">`) or send to a printer. Print `qr_image` once — it does not need to be re-fetched unless the gym loses the printout.

**Errors:**
- `403` — caller's role/org doesn't have access to this gym (same rule as every other gym-scoped staff endpoint: `super_admin` any gym, `org_admin` any gym in their org, `gym_manager` only their assigned gym(s)).
- `404` — gym not found.

---

## `POST /checkin/gym-scan`

**Auth:** MemberJwt

The member's app calls this immediately after scanning the desk QR. Always returns `200` — check the `allowed` flag, never treat this as an error response.

**Request:**
```json
{ "qr_token": "eyJhbGciOi..." }
```

**Response `200` — allowed:**
```json
{
  "allowed": true,
  "gym": { "id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3", "name": "Downtown Branch" },
  "subscription": { "status": "active", "plan": "Monthly Unlimited", "period_end": "2026-09-01" },
  "already_checked_in_today": false
}
```
`already_checked_in_today: true` means a prior scan (this endpoint or the staff-scanned personal entry QR) already marked today's attendance — the member is still let in, just informationally told they're already checked in for the day.

**Response `200` — denied (examples):**
```json
{ "allowed": false, "reason": "Invalid QR code" }
```
```json
{ "allowed": false, "reason": "Access denied" }
```
```json
{ "allowed": false, "reason": "No subscription at this gym" }
```
```json
{ "allowed": false, "reason": "Subscription is paused" }
```
```json
{ "allowed": false, "reason": "Subscription period ended 2026-07-15" }
```

---

## `GET /subscriptions/me` (changed)

**Auth:** MemberJwt

Existing endpoint — now returns three additional fields per subscription.

**Response `200`:**
```json
[
  {
    "id": "b1f2...",
    "member_id": "9a3c...",
    "plan_id": "4d21...",
    "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
    "status": "active",
    "current_period_start": "2026-08-01",
    "current_period_end": "2026-08-31",
    "paused_at": null,
    "plan": { "id": "4d21...", "name": "Monthly Unlimited", "type": "monthly", "price": "49.99" },
    "total_days": 30,
    "days_left": 3,
    "check_ins": 14
  }
]
```

**Field notes:**
- `total_days` — length of the current billing period in days.
- `days_left` — days remaining until `current_period_end`. **Frozen** at the value it had when `paused_at` was stamped if `status: "paused"` — it will not tick down further until the subscription is resumed (at which point `current_period_end` itself shifts forward to compensate, per the existing pause/resume behavior).
- `check_ins` — count of distinct days the member entered this gym (either entry method) during the current period. Also frozen at the pause moment while paused.
- All three are `0` once `status` is `"past_due"` or `"cancelled"` — there is no active period left to report progress against.
