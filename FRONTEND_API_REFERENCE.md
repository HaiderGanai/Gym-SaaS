# Gym SaaS — Frontend API Reference

One-stop Postman-ready reference for every client-facing endpoint: auth, organizations/gyms, staff, members, platform billing, member billing (plans/subscriptions/invoices/VAT), class schedule, bookings/check-in, notifications, reports.

**Base URL (dev):** `http://localhost:3000/api/v1`

**Auth header** (all routes except those marked `Public`):
```
Authorization: Bearer <access_token>
```
There are two independent token types — a **staff token** (from `/auth/staff/*`) and a **member token** (from `/auth/member/*`). Each guard only accepts its own type; using the wrong one returns `401`.

**Seed accounts** (`node seed.js`):
| Role | Email | Password |
|---|---|---|
| super_admin | `super@platform.com` | `Super1234!` |
| org_admin | `owner@test.com` | `Test1234!` |

Seed IDs: `org_id = 6c6ec47d-939c-4a64-aff6-52a3efe7a877`, `gym_id = 2e82ea95-3c50-48bf-93a1-251b7b807cd3`.

## Role hierarchy
```
super_admin → org_admin → gym_manager → front_desk
```
`super_admin` has `org_id: null`, bypasses every role check. `org_admin` bypasses per-gym access checks within their own org.

## JWT payload shapes (decode client-side if needed, don't rely on their contents server-side)

**Staff:**
```ts
{ sub: string; email: string; role: 'super_admin'|'org_admin'|'gym_manager'|'front_desk'; org_id: string|null; gym_ids: string[] }
```

**Member:**
```ts
{ sub: string; email: string; gym_ids: string[]; primary_gym_id: string; status: 'active'|'paused'|'expired'|'cancelled' }
```

`gym_ids` are baked in at login — after any gym-access grant/revoke, that user must **log in again** for their token to reflect it.

## The `organization` branding block

Every login / invite-accept response (staff **and** member) includes an `organization` object next to `access_token`, so the app can theme itself before any authenticated call:

```json
{
  "access_token": "<jwt>",
  "organization": {
    "id": "...",
    "name": "Iron Peak Fitness",
    "logo_url": "https://res.cloudinary.com/.../logo.png",
    "branding": { "primary_color": "#111827", "secondary_color": "#6B7280", "accent": "#F59E0B" },
    "gyms": [ { "id": "...", "name": "Downtown Branch", "type": "general_gym" } ]
  }
}
```

- `null` for `super_admin` logins (no org affiliation).
- **`org_admin`** (and `super_admin`, moot since theirs is null) gets `gyms: {id,name,type}[]` — every branch in the org.
- **Everyone else** (`gym_manager`, `front_desk`, all members) gets `branch: {id,name,type}[]` instead — only the branch(es) they're affiliated with, in place of `gyms`. Check which key is present, not both.
- `branding.primary_color` / `secondary_color` / `accent` / `logo_url` are always present (platform defaults fill anything uncustomized).
- Members resolve their org via `primary_gym_id` → gym → organization.

Gym `type` is one of `general_gym | swimming | boxing | karate | mma` (defaults `general_gym`).

---

## Table of Contents

1. [Auth & Registration](#1-auth--registration)
2. [Organizations & Gyms](#2-organizations--gyms)
3. [Staff](#3-staff)
4. [Members](#4-members)
5. [Platform Billing](#5-platform-billing-org--platform-stripe)
6. [Member Billing — Plans & Discounts](#6-member-billing--plans--discounts)
7. [Member Billing — Subscriptions](#7-member-billing--subscriptions)
8. [Member Billing — Invoices](#8-member-billing--invoices)
9. [Member Billing — VAT](#9-member-billing--vat)
10. [Class Schedule](#10-class-schedule)
11. [Bookings & Check-in](#11-bookings--check-in)
12. [Notifications & Communication](#12-notifications--communication)
13. [Reports](#13-reports)
14. [Global Error Reference](#14-global-error-reference)

---

## 1. Auth & Registration

### Member self-registration
```
POST /members/register              Public
```
```json
{
  "email": "jane.doe@example.com",
  "full_name": "Jane Doe",
  "password": "Member1234!",
  "phone": "+447700900000",
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3"
}
```
`phone` optional. **201:** `{ "message": "Account created successfully. You can now log in.", "member_id": "<uuid>" }`

### Member login
```
POST /auth/member/login              Public
```
```json
{ "email": "jane.doe@example.com", "password": "Member1234!" }
```
**201:** `{ "access_token": "<jwt>", "member_id": "<uuid>", "organization": {...} }` (see branding block above)

### Member signs waiver
```
POST /members/waiver                 MemberJwt
```
```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "signature_url": "https://storage.example.com/signatures/jane-sig.png",
  "document_url": "https://storage.example.com/waivers/gym-waiver-v1.pdf"
}
```
`document_url` optional; IP captured server-side. **201:** `{ "message": "Waiver signed successfully", "waiver_id": "<uuid>" }`. `409` if already signed for that gym (one waiver per member+gym).

### Staff login
```
POST /auth/staff/login               Public
```
```json
{ "email": "owner@test.com", "password": "Test1234!" }
```
**201:** `{ "access_token": "<jwt>", "organization": {...} }` (`null` for super_admin)

### Staff invite → accept
```
POST /staff/invite                   StaffJwt + Roles(org_admin, gym_manager)
```
```json
{ "email": "manager@test.com", "full_name": "Alex Manager", "role": "gym_manager" }
```
Roles: `org_admin | gym_manager | front_desk`. Invite expires 72h. **201:** `{ "message": "Invitation sent to manager@test.com" }`

```
POST /auth/staff/invite/accept       Public
```
```json
{ "token": "<invite_token>", "password": "Manager1234!" }
```
**201:** `{ "access_token": "<jwt>", "organization": {...} }`

### Member invite → accept
```
POST /members/invite                 StaffJwt + Roles(gym_manager, front_desk)
```
```json
{
  "email": "new.member@example.com",
  "full_name": "Sam Smith",
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "phone": "+447700900001"
}
```
**201:** `{ "message": "Invitation sent to new.member@example.com" }`

```
POST /auth/member/invite/accept      Public
```
```json
{ "token": "<invite_token>", "password": "NewMember1234!" }
```
**201:** `{ "access_token": "<jwt>", "member_id": "<uuid>", "organization": {...} }`

### Password reset (OTP) — staff & member, identical shape
```
POST /auth/staff/forgot-password     Public   { "email": "owner@test.com" }
POST /auth/staff/reset-password      Public   { "email": "...", "otp": "482916", "password": "New1234!" }
POST /auth/member/forgot-password    Public   { "email": "jane.doe@example.com" }
POST /auth/member/reset-password     Public   { "email": "...", "otp": "748201", "password": "New1234!" }
```
`forgot-password` always returns `{ "message": "If that email is registered, an OTP has been sent." }` (no enumeration). OTP is 6 digits, **10 min** expiry.

### Change password (OTP, authenticated) — staff & member
```
POST /auth/staff/change-password/send-otp    StaffJwt    (no body)
POST /auth/staff/change-password             StaffJwt    { "otp": "391047", "new_password": "New1234!" }
POST /auth/member/change-password/send-otp   MemberJwt   (no body)
POST /auth/member/change-password            MemberJwt   { "otp": "203847", "new_password": "New1234!" }
```
**201:** `{ "message": "Password changed successfully." }`

### Org self-signup
```
POST /auth/org/signup                Public
```
```json
{
  "organization_name": "Iron Peak Fitness",
  "email": "owner@ironpeak.com",
  "password": "IronPeak1234!",
  "currency": "GBP"
}
```
Creates `Organization` (`subscription_status: pending`) + its first `org_admin`. **201:** `{ "access_token": "<jwt>", "organization": { "id": "...", "subscription_status": "pending", ... } }`. Pending orgs are locked out of everything except `/auth/*` and `/platform/*` (see §5) — `GET /gyms` returns `403`.

---

## 2. Organizations & Gyms

### Create organization
```
POST /organizations                  StaffJwt + Roles(super_admin)
```
```json
{ "name": "FitLife Group", "logo_url": "https://storage.example.com/logos/fitlife.png", "currency": "GBP" }
```
`logo_url`/`currency` optional (currency defaults `GBP`).

### List / get / update / delete organization
```
GET    /organizations                StaffJwt + Roles(super_admin)
GET    /organizations/:id            StaffJwt + Roles(org_admin, gym_manager, front_desk)   — own org only
PATCH  /organizations/:id            StaffJwt + Roles(org_admin)                             — super_admin or own org_admin
DELETE /organizations/:id            StaffJwt + Roles(super_admin)
```
`GET /organizations/:id` response is role-scoped: `org_admin`/`super_admin` get the full `gyms: {id,name,type}[]`; `gym_manager`/`front_desk` get `branch: {id,name,type}[]` limited to their own affiliated gym(s).

**Update — JSON (branding merges, doesn't replace):**
```json
{
  "name": "FitLife Group UK",
  "currency": "USD",
  "accent": "#F59E0B",
  "branding": { "primary_color": "#e11d48", "secondary_color": "#1f2937", "font_family": "Inter", "dark_mode": true }
}
```
**Update — multipart/form-data (logo upload, use when sending a `logo` file):**
| Key | Type | Value |
|---|---|---|
| `logo` | File | image ≤2MB → uploaded to Cloudinary, saved as `logo_url` |
| `accent` | Text | `#F59E0B` (hex, stored as `branding.accent`) |
| `branding` | Text | JSON string, e.g. `{"primary_color":"#e11d48"}` |
| `name` | Text | optional rename |

All fields optional on both PATCH forms — send only what changes.

### Create gym branch
```
POST /gyms                           StaffJwt + Roles(org_admin)
```
**As super_admin** (must include `organization_id`):
```json
{
  "organization_id": "6c6ec47d-939c-4a64-aff6-52a3efe7a877",
  "name": "FitLife Canary Wharf",
  "address": "10 Canada Square, London E14 5AB",
  "timezone": "Europe/London",
  "type": "swimming",
  "tax_mode": "vat",
  "default_tax_rate": 20,
  "tax_inclusive": true,
  "vat_number": "GB123456789"
}
```
**As org_admin** — omit `organization_id` (ignored if sent). Only `name` required. `type` ∈ `general_gym|swimming|boxing|karate|mma` (default `general_gym`). `tax_mode` ∈ `vat|sales_tax|none`. `403` if the org's paid `branch_count` is exceeded — see §5.

### List / get / update / delete gym
```
GET    /gyms                         StaffJwt   — scoped: super_admin=all, org_admin=own org, others=assigned gyms
GET    /gyms/:id                     StaffJwt
PATCH  /gyms/:id                     StaffJwt + Roles(org_admin, gym_manager)
DELETE /gyms/:id                     StaffJwt + Roles(org_admin)
```
`PATCH` body — any subset of the create fields (including `type`); `organization_id` immutable.

---

## 3. Staff

```
GET    /staff                        StaffJwt   — scoped (super_admin=all, org_admin=own org, others=gym colleagues)
GET    /staff/:id                    StaffJwt   — profile + gym_access history
```

### Update staff (role / active status)
```
PATCH /staff/:id                     StaffJwt + Roles(org_admin)   — super_admin any, org_admin own org only
```
```json
{ "role": "gym_manager" }
```
```json
{ "is_active": false }
```
```json
{ "role": "front_desk", "is_active": false }
```
Roles: `org_admin|gym_manager|front_desk`. `org_admin` cannot set `super_admin` or change their own role.

### Grant / revoke gym access
```
POST   /staff/:id/gym-access         StaffJwt + Roles(org_admin, gym_manager)
```
```json
{ "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3" }
```
`gym_manager` limited to gyms in their own `gym_ids`. `409` if already active. Re-activates a revoked row if one exists. Affected staff must **re-login** for the JWT to update.

```
DELETE /staff/:id/gym-access/:gymId  StaffJwt + Roles(org_admin, gym_manager)
```
Soft-delete (`is_active=false`, `revoked_at` stamped). Same own-gyms rule for `gym_manager`.

---

## 4. Members

```
GET  /members                        StaffJwt    — scoped list
GET  /members/profile                MemberJwt   — own profile + gym_access
GET  /members/:id                    StaffJwt    — profile + full gym_access history
```

### Self-update
```
PATCH /members/me                    MemberJwt   — JSON or multipart/form-data
```
```json
{ "full_name": "Alice M. Smith", "phone": "+447911123456", "photo_url": "https://storage.example.com/photos/alice.jpg" }
```
All fields optional, send only what changes. `photo_url` can also be set by uploading an actual file: send `multipart/form-data` with an optional `photo` image field (≤2 MB) instead of/alongside the JSON fields — it uploads to Cloudinary and overwrites `photo_url` with the resulting URL.

### Staff: update status
```
PATCH /members/:id/status            StaffJwt + Roles(org_admin, gym_manager)
```
**Pause:**
```json
{ "status": "paused", "pause_start": "2026-07-05", "resume_date": "2026-07-20" }
```
**Cancel:** `{ "status": "cancelled" }`   **Reactivate:** `{ "status": "active" }` (clears pause dates)   **Expire:** `{ "status": "expired" }`

---

## 5. Platform Billing (org → platform, Stripe)

Test cards: `4242 4242 4242 4242` succeeds · `4000 0025 0000 3155` requires 3DS · `4000 0000 0000 9995` declines. Attach-by-token: `pm_card_visa`, `pm_card_mastercard`, `pm_card_chargeDeclined`.

```
GET  /platform/plans                 Public                          — pricing page
GET  /platform/plans/all             StaffJwt + Roles(super_admin)   — incl. deactivated
```
```
POST /platform/plans                 StaffJwt + Roles(super_admin)
```
```json
{ "name": "Monthly", "interval": "monthly", "price_per_branch": 49.99, "currency": "GBP" }
```
`interval` ∈ `monthly|quarterly|yearly`.
```
PATCH  /platform/plans/:id           StaffJwt + Roles(super_admin)   { "name"?, "price_per_branch"?, "is_active"? }
DELETE /platform/plans/:id           StaffJwt + Roles(super_admin)   — soft deactivate
```

### Checkout & subscription
```
POST /platform/billing/checkout      StaffJwt + Roles(org_admin)
```
```json
{ "plan_id": "<plan_id>", "branch_count": 2 }
```
**201:** `{ "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_…" }` — open in browser, pay with a test card. Webhook flips org to `active`.

```
GET /platform/billing/subscription   StaffJwt + Roles(org_admin)
```
```json
{ "status": "active", "branch_count": 2, "current_period_end": "2026-08-03T…", "stripe_subscription_id": "sub_…", "plan": { "name": "Monthly", "interval": "monthly", "price_per_branch": "49.99" } }
```

```
POST /platform/billing/quantity      StaffJwt + Roles(org_admin)
```
```json
{ "branch_count": 3 }
```
Stripe prorates. `400` if reducing below current gym count.

```
POST /platform/billing/cancel        StaffJwt + Roles(org_admin)    — no body, cancels at period end
```

### Payment methods
```
GET    /platform/billing/payment-methods              StaffJwt + Roles(org_admin)
POST   /platform/billing/payment-methods               StaffJwt + Roles(org_admin)   { "payment_method_id": "pm_card_mastercard", "set_default": true }
PATCH  /platform/billing/payment-methods/:id/default    StaffJwt + Roles(org_admin)   — no body
DELETE /platform/billing/payment-methods/:id            StaffJwt + Roles(org_admin)   — no body
```

### Webhook (backend-only, not called by frontend)
```
POST /platform/billing/webhook       Public (Stripe signature)
```

### Super admin oversight
```
GET   /platform/subscriptions        StaffJwt + Roles(super_admin)   — every org's subscription
PATCH /platform/subscriptions/:id    StaffJwt + Roles(super_admin)
```
```json
{ "extend_days": 30 }
```
```json
{ "status": "grace" }
```
Grace period: 3 days from `invoice.payment_failed`, daily 9:00 reminder cron, then `expired` (locked out except `/auth/*` + `/platform/*`).

---

## 6. Member Billing — Plans & Discounts

### Plans
```
POST /plans                          StaffJwt + Roles(org_admin)
```
```json
{ "gym_id": "<gym_id>", "name": "Monthly Unlimited", "type": "monthly", "price": 50.00, "billing_interval": "per month" }
```
`type` ∈ `monthly|weekly|yearly|payg|class_pack`. Optional: `included_credits` (packs), `is_vat_applicable` (default true), `vat_rate_override`.
```
GET   /plans                         StaffJwt   — ?gym_id=&include_archived=true
GET   /plans/:id                     StaffJwt
PATCH /plans/:id                     StaffJwt + Roles(org_admin)   { "price": 55.00 }   — response includes active_subscriptions
DELETE /plans/:id                    StaffJwt + Roles(org_admin)   — archive (soft)
```

### Discounts
```
POST /discounts                      StaffJwt + Roles(org_admin)
```
```json
{ "gym_id": "<gym_id>", "code": "WELCOME10", "type": "percentage", "value": 10, "max_uses": 100, "expires_at": "2026-12-31" }
```
`type` ∈ `percentage|fixed`.
```
GET   /discounts                     StaffJwt   — ?gym_id=
PATCH /discounts/:id                 StaffJwt + Roles(org_admin)   { "value"?, "max_uses"?, "expires_at"?, "is_active"? }
DELETE /discounts/:id                StaffJwt + Roles(org_admin)   — deactivate (soft, FK-referenced)
```

---

## 7. Member Billing — Subscriptions

```
POST /subscriptions                  StaffJwt + Roles(org_admin, gym_manager, front_desk)
```
```json
{ "member_id": "<member_id>", "plan_id": "<plan_id>", "discount_code": "WELCOME10", "mark_paid": true, "payment_method": "cash" }
```
Only `member_id`+`plan_id` required. `mark_paid: true` = invoice created already `paid`. Response is `{ subscription, invoice }`. One ongoing subscription per member per gym (`409` otherwise).

```
GET  /subscriptions                  StaffJwt    — ?gym_id=&member_id=&status= (active|paused|past_due|cancelled)
GET  /subscriptions/me               MemberJwt   — own subs + plan
GET  /subscriptions/:id              StaffJwt    — + plan, member, discount, invoices
```

```
POST /subscriptions/:id/renew        StaffJwt + Roles(org_admin, gym_manager, front_desk)
```
```json
{ "mark_paid": true, "payment_method": "card" }
```
Body optional. Always full price (promo is first-invoice only).

```
PATCH /subscriptions/:id/pause       StaffJwt + Roles(org_admin, gym_manager)   — no body
PATCH /subscriptions/:id/resume      StaffJwt + Roles(org_admin, gym_manager)   — no body
PATCH /subscriptions/:id/cancel      StaffJwt + Roles(org_admin, gym_manager)   — no body, permanent
```

---

## 8. Member Billing — Invoices

No `POST /invoices` — created only by subscription create/renew.

```
GET /invoices                        StaffJwt    — ?gym_id=&member_id=&status= (pending|paid|failed|refunded)
GET /invoices/me                     MemberJwt   — own history
GET /invoices/:id                    StaffJwt    — full detail incl. VAT breakdown
```

```
PATCH /invoices/:id/pay              StaffJwt + Roles(org_admin, gym_manager, front_desk)
```
```json
{ "payment_method": "cash" }
```
`payment_method` ∈ `cash|card|other` (default `cash`). Re-activates a `past_due` subscription.

```
PATCH /invoices/:id/refund           StaffJwt + Roles(org_admin)   — no body, only paid invoices
POST  /invoices/:id/resend           StaffJwt + Roles(org_admin, gym_manager, front_desk)   — no body, emails the invoice
```

---

## 9. Member Billing — VAT

```
POST /vat/summaries                  StaffJwt + Roles(org_admin)
```
```json
{ "gym_id": "<gym_id>", "period_type": "monthly", "period_start": "2026-07-01" }
```
`period_type` ∈ `monthly|quarterly`. `400` if no paid invoices in the period.

```
GET   /vat/summaries                 StaffJwt + Roles(org_admin, gym_manager)   — ?gym_id=
PATCH /vat/summaries/:id/file        StaffJwt + Roles(org_admin)                — no body, sets is_filed + filed_at
GET   /vat/org-rollup                StaffJwt + Roles(org_admin)                — ?period_start=&period_end= (live, not stored)
```

---

## 10. Class Schedule

All datetimes UTC ISO. `rrule` **must include `DTSTART`**.

### Templates (recurring patterns)
```
POST /schedule/templates             StaffJwt + Roles(org_admin, gym_manager)
```
```json
{
  "gym_id": "<gym_id>",
  "instructor_id": "<staff_id>",
  "activity_name": "Morning Yoga",
  "location": "Studio A",
  "capacity": 12,
  "duration_minutes": 60,
  "rrule": "DTSTART:20260720T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
  "booking_window_hours": 48,
  "cancellation_cutoff_hours": 2
}
```
Optional `generate_until` (ISO date, max 366 days out). Materializes slots 30 days ahead by default. **201:** `{ template, created, skipped_existing, skipped_conflicts, generated_until, future_slots }`

rrule examples:
| Pattern | rrule |
|---|---|
| Every day 07:00 | `DTSTART:20260720T070000Z\nRRULE:FREQ=DAILY` |
| Tue+Thu 18:30 | `DTSTART:20260721T183000Z\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH` |
| 1st of month 10:00 | `DTSTART:20260801T100000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1` |
| Weekly, 10 sessions | `DTSTART:20260720T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10` |

```
GET /schedule/templates              StaffJwt   — ?gym_id=&include_inactive=true; each row has computed generated_until/future_slots
GET /schedule/templates/:id          StaffJwt
```

```
PATCH /schedule/templates/:id        StaffJwt + Roles(org_admin, gym_manager)
```
Template-only field change:
```json
{ "capacity": 15 }
```
Propagate to future occurrences:
```json
{ "capacity": 15, "apply_to_future": true }
```
Timing change (deletes+regenerates future *empty* slots, keeps booked ones):
```json
{ "rrule": "DTSTART:20260720T100000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR", "apply_to_future": true }
```
Extend materialized window (replaces the old separate `/generate` endpoint — just PATCH):
```json
{ "generate_until": "2026-10-01" }
```
Any of the above can be combined in one call.

```
DELETE /schedule/templates/:id       StaffJwt + Roles(org_admin, gym_manager)   — deactivate; removes future empty slots, keeps booked
```

### Slots
```
POST /schedule/slots                 StaffJwt + Roles(org_admin, gym_manager)
```
```json
{
  "gym_id": "<gym_id>",
  "instructor_id": "<staff_id>",
  "activity_name": "Boxing Masterclass",
  "location": "Main Floor",
  "starts_at": "2026-07-25T17:00:00Z",
  "ends_at": "2026-07-25T18:30:00Z",
  "capacity": 20
}
```
Optional: `booking_window_hours` (default 24), `cancellation_cutoff_hours` (default 2). `409` on instructor overlap.

```
GET /schedule/slots                  StaffJwt    — ?gym_id=&from=&to=&status=(enabled|disabled)&template_id= (default today→+30d)
GET /schedule/slots/:id              StaffJwt    — + bookings[] roster preview
GET /schedule/slots/browse           MemberJwt   — enabled future slots in member's gyms; ?gym_id=&from=&to=
```
Browse response per slot adds: `spots_remaining`, `is_full`, `booking_opens_at`, `cancellation_cutoff_at`, `booking_open`.

```
PATCH /schedule/slots/:id            StaffJwt + Roles(org_admin, gym_manager)
```
```json
{ "capacity": 15, "starts_at": "2026-07-25T18:00:00Z", "ends_at": "2026-07-25T19:00:00Z" }
```
This occurrence only. `409` if `capacity` < `booking_count` or instructor overlap.

```
PATCH /schedule/slots/:id/disable    StaffJwt + Roles(org_admin, gym_manager)   — no body, emails affected members
PATCH /schedule/slots/:id/enable     StaffJwt + Roles(org_admin, gym_manager)   — no body
DELETE /schedule/slots/:id           StaffJwt + Roles(org_admin, gym_manager)   — only if zero bookings, else 409
```

---

## 11. Bookings & Check-in

```
POST /bookings                       MemberJwt
```
```json
{ "slot_id": "<slot_id>" }
```
**201 (spot available):**
```json
{ "message": "Booking confirmed", "booking": { "id": "…", "status": "confirmed", "waitlist_position": null, "qr_token": "eyJ…", "qr_image": "data:image/png;base64,iVBORw0KG…", "slot": {...} } }
```
**201 (class full):**
```json
{ "message": "Class is full — you are on the waitlist (position 2)", "booking": { "status": "waitlisted", "waitlist_position": 2, "qr_token": null, "qr_image": null } }
```
Errors: `403` inactive membership / no active subscription at gym / no credits left · `404` slot unknown/disabled · `400` class started or booking window not open · `409` duplicate/overlapping booking.

```
GET /bookings/me                     MemberJwt   — ?include_past=true
```

```
PATCH /bookings/:id/cancel           MemberJwt   — no body
```
```json
{ "message": "Booking cancelled", "promoted_from_waitlist": null }
```
`403` past `cancellation_cutoff_hours`. Waitlisted bookings always cancellable.

```
GET /bookings                        StaffJwt   — ?gym_id=&slot_id=&member_id=&status=(confirmed|waitlisted|checked_in|no_show|cancelled)
PATCH /bookings/:id/staff-cancel     StaffJwt   — no body, cutoff-free, promotes waitlist + emails promoted member
PATCH /bookings/:id/no-show          StaffJwt   — no body; 400 before class start, 409 if not confirmed
```

### Entry QR (gym-door)
```
GET /members/me/entry-qr             MemberJwt   — ?gym_id= for non-primary gym
```
```json
{ "qr_token": "eyJ…", "qr_image": "data:image/png;base64,iVBORw0KG…", "gym_id": "<uuid>", "valid_until": "2026-08-16T23:59:59.999Z" }
```
`qr_image` is a ready-to-render base64 PNG data URI (`<img src={qr_image}>`) — no client-side QR library needed.
`403` if no active subscription at that gym. Refetch on every screen open — never cache. Generated fresh from the live subscription each call, so a pause/cancel/renewal is reflected automatically on the next fetch.

### Scanner endpoints (staff device)
```
POST /checkin/entry                  StaffJwt
```
```json
{ "qr_token": "<scanned string>" }
```
Always **200**, check `allowed`:
```json
{ "allowed": true, "member": {...}, "subscription": { "status": "active", "plan": "Monthly", "period_end": "2026-08-16" } }
```
```json
{ "allowed": false, "reason": "Subscription is paused", "member": {...} }
```

```
POST /checkin/booking                StaffJwt
```
```json
{ "qr_token": "<scanned string>" }
```
```json
{ "allowed": true, "member": {...}, "class": { "activity_name": "Yoga", "starts_at": "…", "location": "Studio 1" }, "checked_in_at": "…" }
```

---

## 12. Notifications & Communication

### Member device token
```
POST   /notifications/device-token   MemberJwt   { "fcm_token": "<fcm-token-from-sdk>" }
DELETE /notifications/device-token   MemberJwt   — no body, call on logout
```

### Member inbox
```
GET   /notifications                 MemberJwt   — ?unread_only=true
GET   /notifications/unread-count    MemberJwt   — { "unread_count": 3 }
PATCH /notifications/:id/read        MemberJwt   — no body
PATCH /notifications/read-all        MemberJwt   — no body, { "marked_read": 3 }
```
Feed row shape:
```json
{
  "id": "…", "type": "waitlist_promoted", "title": "You're in!",
  "body": "A spot opened up in Yoga — you're now confirmed.",
  "data": { "activity_name": "Yoga", "starts_at": "…" },
  "email_status": "sent", "push_status": "sent",
  "is_read": false, "read_at": null, "created_at": "…"
}
```
`type` ∈ `waitlist_promoted|slot_disabled|invoice_ready|booking_reminder|announcement`. `email_status`/`push_status` ∈ `skipped|sent|failed`.

### Staff broadcast
```
POST /communication/broadcast        StaffJwt + Roles(org_admin, gym_manager)
```
```json
{ "gym_id": "<gym_id>", "title": "Closed for maintenance", "body": "We'll be closed this Sunday for servicing." }
```
Omit `member_ids` to reach every active member, or target specific ones: `"member_ids": ["<id>", "<id>"]`. **200:** `{ "message": "Announcement sent", "targeted": 42, "notified": 42 }`

Fired automatically (no manual trigger): waitlist promotion, slot disabled, invoice ready, booking reminders (15-min cron, 2h lead time).

---

## 13. Reports

Dates `YYYY-MM-DD`; range is `[period_start, period_end)` — `period_end` exclusive.

```
GET /reports/gyms/:gymId/stats       StaffJwt + Roles(org_admin, gym_manager)   — ?period_start=&period_end= (required)
```
```json
{
  "gym_id": "…", "gym_name": "Downtown Branch",
  "revenue": { "total": 4820.00, "invoice_count": 63, "by_payment_method": { "cash": 1200.00, "card": 3420.00, "other": 200.00 } },
  "bookings": { "confirmed": 12, "checked_in": 210, "no_show": 18, "cancelled": 34, "waitlisted": 4, "no_show_rate": 7.89 },
  "attendance": { "fill_rate": 68.4, "total_capacity": 400, "total_booked": 274 },
  "members": { "new_members": 9, "active_members": 142, "active_subscriptions": 138, "cancelled_subscriptions": 5, "churn_rate": 3.5 }
}
```

```
GET /reports/org/stats               StaffJwt + Roles(org_admin)   — ?period_start=&period_end=
```
Same shape as above, nested under `gyms: [...]` plus a summed `totals` block (rates recomputed from summed counts, not averaged). `400` for `super_admin` — use the per-gym endpoint instead.

No endpoint triggers the daily digest email — fires automatically at 23:55 to every active `org_admin`.

---

## 14. Global Error Reference

| Scenario | Status | Body |
|---|---|---|
| JWT missing/invalid | 401 | `{ "message": "Unauthorized" }` |
| Wrong credentials | 401 | `{ "message": "Invalid credentials" }` |
| Role not allowed for endpoint | 403 | `{ "message": "Forbidden resource" }` |
| Cross-org / cross-gym access | 403 | `{ "message": "Access denied" }` |
| Org subscription not active/grace | 403 | `{ "message": "Your organization subscription is not active…" }` (everything except `/auth/*`, `/platform/*`) |
| Branch quota reached | 403 | `{ "message": "Your plan covers N branch(es)…" }` |
| Not found | 404 | `{ "message": "<Resource> not found" }` |
| Duplicate/conflict (email, waiver, gym access, booking, discount code) | 409 | `{ "message": "…already exists / already has…" }` |
| Invalid/expired OTP | 400 | `{ "message": "Invalid or expired OTP" }` |
| Invalid/expired invite token | 400/404 | `{ "message": "Invite token has expired" }` / `{ "message": "Invite token not found" }` |
| Validation failure (bad body/UUID) | 400 | `{ "message": ["<validation error>"] }` |

---

### Notes for the frontend integration

- Every "list" endpoint that's role-scoped (staff) returns different rows for `super_admin`/`org_admin`/`gym_manager`/`front_desk` automatically — no query param needed, the JWT drives it.
- Re-login is required after any gym-access grant/revoke or role change — tokens don't self-refresh.
- Both QR codes (class check-in, gym-door entry) ship as a ready-to-render `qr_image` (base64 PNG data URI) alongside the raw `qr_token` — just `<img src={qr_image}>`, no client-side QR rendering library needed. Fetch fresh each time they're displayed, never cache client-side beyond the current screen session.
- Deeper per-module walkthroughs with full request/response flows and quick-test recipes live in the sibling `*_MODULE_OVERVIEW.md` / `*_POSTMAN_ENDPOINTS.md` files at the repo root, if a specific flow needs more detail than fits here.
