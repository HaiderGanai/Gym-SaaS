# Member Billing — Postman Testing Guide

End-to-end flow: define plans & discounts → subscribe a member (manual/cash billing) → settle invoices → renew → VAT summaries.

Base URL: `http://localhost:3000/api/v1`

Prereqs: an **active** org (platform subscription paid or seeded), at least one gym, and a member with access to that gym. Dev seed: org_admin `owner@test.com` / `Test1234!`, gym `2e82ea95-3c50-48bf-93a1-251b7b807cd3`.

Login first — **POST** `/auth/staff/login` → save as `{{admin_token}}`. For member-facing calls, **POST** `/auth/member/login` → `{{member_token}}`.

---

## 1. Plans (org_admin)

### Create a plan
**POST** `/plans` — `Bearer {{admin_token}}`
```json
{
  "gym_id": "{{gym_id}}",
  "name": "Monthly Unlimited",
  "type": "monthly",
  "price": 50.00,
  "billing_interval": "per month"
}
```
`type`: `monthly` | `weekly` | `yearly` | `payg` | `class_pack`. Optional: `included_credits` (packs), `is_vat_applicable` (default true), `vat_rate_override` (falls back to the gym's `default_tax_rate`).

Class pack example:
```json
{
  "gym_id": "{{gym_id}}",
  "name": "10-Class Pack",
  "type": "class_pack",
  "price": 80.00,
  "included_credits": 10
}
```
→ save `id` as `{{plan_id}}`.

### List / read (any staff)
| Method | URL | Notes |
|---|---|---|
| GET | `/plans` | scoped to your gyms; `?gym_id=...` to filter, `?include_archived=true` for archived too |
| GET | `/plans/{{plan_id}}` | single plan |

### Update
**PATCH** `/plans/{{plan_id}}` — `Bearer {{admin_token}}`
```json
{ "price": 55.00 }
```
Response includes `active_subscriptions` — show the "members are on this plan" warning when > 0.

### Archive (soft delete)
**DELETE** `/plans/{{plan_id}}`
```json
{ "message": "Plan archived. Existing subscriptions are unaffected; new sign-ups are blocked." }
```

---

## 2. Discounts (org_admin)

### Create
**POST** `/discounts` — `Bearer {{admin_token}}`
```json
{
  "gym_id": "{{gym_id}}",
  "code": "WELCOME10",
  "type": "percentage",
  "value": 10,
  "max_uses": 100,
  "expires_at": "2026-12-31"
}
```
`type`: `percentage` (value = %) or `fixed` (value = amount off).

### Others
| Method | URL | Body |
|---|---|---|
| GET | `/discounts?gym_id={{gym_id}}` | — (any staff) |
| PATCH | `/discounts/:id` | `{ "value": 15, "max_uses": 50, "expires_at": "...", "is_active": true }` (all optional) |
| DELETE | `/discounts/:id` | — deactivates (soft; rows may be referenced by subscriptions) |

---

## 3. Subscriptions (staff-led, manual billing)

### Subscribe a member
**POST** `/subscriptions` — org_admin / gym_manager / front_desk
```json
{
  "member_id": "{{member_id}}",
  "plan_id": "{{plan_id}}",
  "discount_code": "WELCOME10",
  "mark_paid": true,
  "payment_method": "cash"
}
```
All except `member_id` + `plan_id` optional. `start_date` defaults to today. `mark_paid: true` = cash collected at the desk → the auto-generated first invoice is created already `paid`. Omit it to create the invoice `pending` and settle later.

Response — subscription **and** its first invoice:
```json
{
  "subscription": {
    "id": "…", "status": "active",
    "current_period_start": "2026-07-06…", "current_period_end": "2026-08-06…",
    "discount_id": "…"
  },
  "invoice": {
    "id": "…", "invoice_number": "INV-2026-00001", "status": "paid",
    "amount": 45, "net_amount": 37.5, "tax_amount": "7.50", "tax_rate": "20.00"
  }
}
```
(£50 plan − 10% promo = £45; VAT-inclusive gym at 20% → £37.50 net + £7.50 VAT.)

### Read
| Method | URL | Who |
|---|---|---|
| GET | `/subscriptions` | staff — scoped; filters `?gym_id=&member_id=&status=` |
| GET | `/subscriptions/me` | member — own subscriptions + plan |
| GET | `/subscriptions/:id` | staff — includes plan, member, discount, invoices |

`status` filter values: `active` | `paused` | `past_due` | `cancelled`.

### Renew (advance the period, issue next invoice)
**POST** `/subscriptions/:id/renew` — org_admin / gym_manager / front_desk
```json
{ "mark_paid": true, "payment_method": "card" }
```
Body optional — omit to leave the new invoice `pending`. Lapsed subscriptions restart today; current ones extend from their period end. Renewals always charge **full plan price** (promo codes are first-invoice only).

### Lifecycle (org_admin / gym_manager)
| Method | URL | Effect |
|---|---|---|
| PATCH | `/subscriptions/:id/pause` | active → paused |
| PATCH | `/subscriptions/:id/resume` | paused → active |
| PATCH | `/subscriptions/:id/cancel` | any → cancelled (permanent — renew is blocked, create a new subscription instead) |

**Automatic:** a daily 8:00 cron marks recurring (monthly/weekly/yearly) subscriptions whose period ended without renewal as `past_due`. Paying their invoice re-activates them.

---

## 4. Invoices

Invoices are only created by the system (subscription create + renew) — there is no `POST /invoices`.

### Read
| Method | URL | Who |
|---|---|---|
| GET | `/invoices` | staff — scoped; filters `?gym_id=&member_id=&status=` (`pending`/`paid`/`failed`/`refunded`) |
| GET | `/invoices/me` | member — own invoice history |
| GET | `/invoices/:id` | staff — full detail: member, subscription + plan, gym, VAT breakdown |

### Mark paid (the manual-billing `moment`)
**PATCH** `/invoices/:id/pay` — org_admin / gym_manager / front_desk
```json
{ "payment_method": "cash" }
```
`payment_method`: `cash` | `card` | `other` (default `cash`). Sets `paid_at`; if the subscription was `past_due` it flips back to `active`.

### Refund
**PATCH** `/invoices/:id/refund` — **org_admin only**, no body. Only `paid` invoices. Marks the record `refunded` — actual money movement is on you (cash drawer).

### Resend by email
**POST** `/invoices/:id/resend` — org_admin / gym_manager / front_desk, no body
```json
{ "message": "Invoice INV-2026-00001 sent to member@example.com" }
```

---

## 5. VAT (org_admin unless noted)

### Generate a period summary (stored record, per gym)
**POST** `/vat/summaries`
```json
{
  "gym_id": "{{gym_id}}",
  "period_type": "monthly",
  "period_start": "2026-07-01"
}
```
`period_type`: `monthly` | `quarterly`. Aggregates **paid** invoices in the period:
```json
{ "gross_revenue": 95, "net_revenue": 79.17, "total_vat_collected": 15.83, "invoice_count": 2, "is_filed": false }
```
400 if the period has no paid invoices.

### Others
| Method | URL | Who |
|---|---|---|
| GET | `/vat/summaries?gym_id={{gym_id}}` | org_admin, gym_manager |
| PATCH | `/vat/summaries/:id/file` | org_admin — sets `is_filed` + `filed_at` |
| GET | `/vat/org-rollup?period_start=2026-07-01&period_end=2026-07-31` | org_admin — live per-gym breakdown + org totals (not stored) |

---

## Error reference

| Status | Endpoint | Cause |
|---|---|---|
| 409 `Member already has an ongoing subscription at this gym…` | POST `/subscriptions` | active/paused/past_due sub exists — cancel first |
| 400 `Member has no active access to this gym` | POST `/subscriptions` | no active MemberGymAccess row for the plan's gym |
| 404 `Plan not found or archived` | POST `/subscriptions` | bad or archived `plan_id` |
| 404 `Discount code not found` | POST `/subscriptions` | wrong code, wrong gym, or deactivated |
| 400 `Discount code has expired` / `…reached its usage limit` | POST `/subscriptions` | expiry / max_uses hit |
| 409 `An active discount with this code already exists…` | POST `/discounts` | duplicate code per gym |
| 400 `Invoice is already paid` | PATCH `/invoices/:id/pay` | double payment |
| 400 `Only paid invoices can be refunded` | PATCH `/invoices/:id/refund` | invoice not `paid` |
| 400 `Cancelled subscriptions cannot be renewed…` | POST `/subscriptions/:id/renew` | create a new subscription instead |
| 400 `Only active subscriptions can be paused…` | pause/resume | wrong state transition |
| 400 `No paid invoices in this period…` | POST `/vat/summaries` | empty period |
| 403 `Access denied` | any | gym outside your scope |

## Quick reference — all endpoints

| Method | URL | Auth |
|---|---|---|
| POST | `/plans` | org_admin |
| GET | `/plans` / `/plans/:id` | any staff |
| PATCH / DELETE | `/plans/:id` | org_admin |
| POST | `/discounts` | org_admin |
| GET | `/discounts` | any staff |
| PATCH / DELETE | `/discounts/:id` | org_admin |
| POST | `/subscriptions` | org_admin, gym_manager, front_desk |
| GET | `/subscriptions` / `/subscriptions/:id` | any staff (scoped) |
| GET | `/subscriptions/me` | member |
| POST | `/subscriptions/:id/renew` | org_admin, gym_manager, front_desk |
| PATCH | `/subscriptions/:id/pause` `/resume` `/cancel` | org_admin, gym_manager |
| GET | `/invoices` / `/invoices/:id` | any staff (scoped) |
| GET | `/invoices/me` | member |
| PATCH | `/invoices/:id/pay` | org_admin, gym_manager, front_desk |
| PATCH | `/invoices/:id/refund` | org_admin |
| POST | `/invoices/:id/resend` | org_admin, gym_manager, front_desk |
| POST | `/vat/summaries` | org_admin |
| GET | `/vat/summaries` | org_admin, gym_manager |
| PATCH | `/vat/summaries/:id/file` | org_admin |
| GET | `/vat/org-rollup` | org_admin |
