# Platform Billing — Postman Testing Guide

End-to-end test flow: create the organization → pick a plan → pay with Stripe test cards → unlock dashboard → branding → branches → payment-method CRUD → cancel/admin ops.

Base URL: `http://localhost:3000/api/v1`

---

## 0. One-time setup

### .env additions

```
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxx      # Stripe Dashboard → Developers → API keys (test mode)
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx    # printed by `stripe listen` below
```

### Forward webhooks to your local server (Stripe CLI)

```bash
stripe login   # once
stripe listen --forward-to localhost:3000/api/v1/platform/billing/webhook
```

Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`, then **restart the dev server**. Without this, payments succeed on Stripe but your org never flips to `active`.

### Existing dev database only

The new `subscription_status` column defaults to `pending`, which locks out the previously seeded org. Unlock once:

```sql
UPDATE organizations SET subscription_status = 'active';
```

### Stripe test cards (entered on the Checkout page)

| Card number | Behavior |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0025 0000 3155` | Requires 3D Secure confirmation |
| `4000 0000 0000 9995` | Declined (insufficient funds) |

Any future expiry, any CVC, any postcode. For API-attached payment methods use test tokens like `pm_card_visa`, `pm_card_mastercard`, `pm_card_visa_debit`, `pm_card_chargeDeclined`.

---

## 1. Super admin: create the three plans

Login first:

**POST** `/auth/staff/login`
```json
{
  "email": "super@platform.com",
  "password": "Super1234!"
}
```
→ save `access_token` as `{{super_token}}`.

**POST** `/platform/plans` — `Authorization: Bearer {{super_token}}` (repeat 3×)

```json
{
  "name": "Monthly",
  "interval": "monthly",
  "price_per_branch": 49.99,
  "currency": "GBP"
}
```
```json
{
  "name": "Quarterly",
  "interval": "quarterly",
  "price_per_branch": 44.99,
  "currency": "GBP"
}
```
```json
{
  "name": "Yearly",
  "interval": "yearly",
  "price_per_branch": 39.99,
  "currency": "GBP"
}
```

Each response includes `id` (save the monthly one as `{{plan_id}}`), plus the auto-created `stripe_product_id` / `stripe_price_id`.

Other plan ops (all super_admin):

| Method | URL | Body |
|---|---|---|
| GET | `/platform/plans/all` | — (includes deactivated) |
| PATCH | `/platform/plans/{{plan_id}}` | `{ "name": "Monthly Pro" }` or `{ "price_per_branch": 59.99 }` (creates new Stripe Price, archives old) or `{ "is_active": false }` |
| DELETE | `/platform/plans/{{plan_id}}` | — (soft deactivate) |

---

## 2. Public pricing page

**GET** `/platform/plans` — no auth. Returns the active plans a visitor sees.

---

## 3. Organization signs up

**POST** `/auth/org/signup` — public
```json
{
  "organization_name": "Iron Peak Fitness",
  "email": "owner@ironpeak.com",
  "password": "IronPeak1234!",
  "currency": "GBP"
}
```

Response:
```json
{
  "access_token": "…",
  "organization": { "id": "…", "name": "Iron Peak Fitness", "subscription_status": "pending", "…": "…" }
}
```
→ save token as `{{org_token}}`, org id as `{{org_id}}`.

**Verify the lock:** GET `/gyms` with `{{org_token}}` → **403** `"Your organization subscription is not active…"` — pending orgs have no dashboard. Only `/auth/*` and `/platform/*` work.

---

## 4. Checkout (pay with Stripe)

**POST** `/platform/billing/checkout` — `Bearer {{org_token}}`
```json
{
  "plan_id": "{{plan_id}}",
  "branch_count": 2
}
```

Response:
```json
{ "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_…" }
```

Open `checkout_url` in a browser, pay with `4242 4242 4242 4242`. The `stripe listen` terminal shows `checkout.session.completed` being forwarded; the server activates the org.

**Verify activation:**

**GET** `/platform/billing/subscription` — `Bearer {{org_token}}`
```json
{
  "status": "active",
  "branch_count": 2,
  "current_period_end": "2026-08-03T…",
  "stripe_subscription_id": "sub_…",
  "plan": { "name": "Monthly", "interval": "monthly", "price_per_branch": "49.99" }
}
```

GET `/gyms` now returns **200** — dashboard unlocked.

---

## 5. Design the organization (branding + logo upload)

**PATCH** `/organizations/{{org_id}}` — `Bearer {{org_token}}`. Accepts **JSON** or **multipart/form-data** (use multipart when uploading a logo).

### JSON (no logo file)
```json
{
  "accent": "#F59E0B",
  "branding": {
    "primary_color": "#e11d48",
    "secondary_color": "#1f2937",
    "font_family": "Inter",
    "font_size_base": 16,
    "dark_mode": true
  }
}
```

### Multipart (Postman → Body → form-data)

| Key | Type | Value |
|---|---|---|
| `logo` | File | pick an image (≤ 2 MB, image/* only) — uploaded to Cloudinary, saved as `logo_url` |
| `accent` | Text | `#F59E0B` — stored as `branding.accent` |
| `branding` | Text | `{"primary_color":"#e11d48","font_family":"Inter"}` — JSON as a string |
| `name` | Text | (optional) rename the org |

Notes:
- `branding` **merges** — a partial update never wipes existing theme keys.
- The response returns the Cloudinary `logo_url` (`https://res.cloudinary.com/…/gym-saas/org-logos/…`).
- Requires `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `.env`.

Read it back with GET `/organizations/{{org_id}}`. Editable anytime while the subscription is active.

---

## 6. Branches (gyms) respect the paid quantity

**POST** `/gyms` — `Bearer {{org_token}}` (paid for 2 → first two succeed)
```json
{
  "name": "Iron Peak — Downtown",
  "address": "12 High Street, London",
  "timezone": "Europe/London"
}
```

The **3rd** create returns **403**:
```json
{ "message": "Your plan covers 2 branch(es). Upgrade via POST /platform/billing/quantity to add more." }
```

**Upgrade branches:**

**POST** `/platform/billing/quantity` — `Bearer {{org_token}}`
```json
{ "branch_count": 3 }
```
Stripe prorates the difference automatically on the next invoice. Reducing below the number of gyms you currently have is rejected with 400.

---

## 7. Payment methods — full CRUD

All `Bearer {{org_token}}` (org_admin).

### Add / save a card
**POST** `/platform/billing/payment-methods`
```json
{
  "payment_method_id": "pm_card_mastercard",
  "set_default": true
}
```
Response:
```json
{ "id": "pm_…", "brand": "mastercard", "last4": "4444", "is_default": true }
```

### List saved cards
**GET** `/platform/billing/payment-methods`
```json
[
  { "id": "pm_…", "brand": "visa", "last4": "4242", "exp_month": 4, "exp_year": 2028, "is_default": false },
  { "id": "pm_…", "brand": "mastercard", "last4": "4444", "exp_month": 12, "exp_year": 2030, "is_default": true }
]
```

### Set default card
**PATCH** `/platform/billing/payment-methods/pm_xxx/default` — no body
```json
{ "message": "Default payment method updated." }
```

### Delete a card
**DELETE** `/platform/billing/payment-methods/pm_xxx` — no body
```json
{ "message": "Payment method removed." }
```
(404 if the org has no Stripe customer; 403 if the card belongs to another org's customer.)

---

## 8. Cancel

**POST** `/platform/billing/cancel` — `Bearer {{org_token}}`, no body
```json
{ "message": "Subscription will cancel at the end of the current period." }
```
Access continues until `current_period_end`; when Stripe fires `customer.subscription.deleted`, the org locks.

---

## 9. Super admin: oversight & support

All `Bearer {{super_token}}`.

**GET** `/platform/subscriptions` — every org's subscription with org + plan embedded.

**PATCH** `/platform/subscriptions/{{subscription_id}}`

Comp/extend an org 30 days (also re-activates):
```json
{ "extend_days": 30 }
```
Force a status (e.g. simulate grace to test the lock/reminders without waiting for a real failed renewal):
```json
{ "status": "grace" }
```
```json
{ "status": "expired" }
```

---

## 10. Testing the grace flow

Real path: Stripe retries a failing renewal card → `invoice.payment_failed` webhook → status `grace`, `grace_ends_at = +3 days` → daily 9:00 cron emails every org_admin → unpaid after 3 days → `expired`, dashboard locked.

Fast paths for testing:

1. **Force it**: `PATCH /platform/subscriptions/:id` with `{ "status": "grace" }` (super_admin) — org keeps access, reminder mail goes out at the next 9:00 cron run.
2. **Trigger the webhook**: `stripe trigger invoice.payment_failed` fires a sample event (note: sample events reference a random subscription, so our handler will usually no-op — forcing via the admin endpoint is the reliable way).
3. **Declined-card checkout**: pay the Checkout page with `4000 0000 0000 9995` — payment never completes, org stays `pending`.

---

## Error reference

| Status | Endpoint | Cause |
|---|---|---|
| 403 `Your organization subscription is not active…` | any org-staff route | org is `pending` / `expired` / `cancelled` |
| 403 `Your plan covers N branch(es)…` | POST `/gyms` | branch quota reached — upgrade quantity |
| 400 `Organization already has an active subscription` | POST `/platform/billing/checkout` | already `active`/`grace` |
| 404 `Plan not found or inactive` | checkout | bad/deactivated `plan_id` |
| 400 `You have N branches — delete branches before reducing below that.` | quantity | downgrade below current gym count |
| 400 `No active subscription to update` | quantity | org never paid / expired |
| 409 `Email already registered` | org signup | staff email exists |
| 400 `Invalid webhook signature` | webhook | wrong `STRIPE_WEBHOOK_SECRET` or body not raw |
| 403 `Payment method does not belong to your organization` | DELETE payment method | card is on another customer |
| 404 `No Stripe customer for this organization` | payment methods | org never started a checkout / attached a card |

## Quick reference — all new endpoints

| Method | URL | Auth | Body |
|---|---|---|---|
| POST | `/auth/org/signup` | Public | `organization_name, email, password, currency?` |
| GET | `/platform/plans` | Public | — |
| GET | `/platform/plans/all` | super_admin | — |
| POST | `/platform/plans` | super_admin | `name, interval, price_per_branch, currency?` |
| PATCH | `/platform/plans/:id` | super_admin | `name?, price_per_branch?, is_active?` |
| DELETE | `/platform/plans/:id` | super_admin | — |
| POST | `/platform/billing/checkout` | org_admin | `plan_id, branch_count` |
| GET | `/platform/billing/subscription` | org_admin | — |
| POST | `/platform/billing/quantity` | org_admin | `branch_count` |
| POST | `/platform/billing/cancel` | org_admin | — |
| GET | `/platform/billing/payment-methods` | org_admin | — |
| POST | `/platform/billing/payment-methods` | org_admin | `payment_method_id, set_default?` |
| PATCH | `/platform/billing/payment-methods/:id/default` | org_admin | — |
| DELETE | `/platform/billing/payment-methods/:id` | org_admin | — |
| POST | `/platform/billing/webhook` | Stripe signature | raw Stripe event |
| GET | `/platform/subscriptions` | super_admin | — |
| PATCH | `/platform/subscriptions/:id` | super_admin | `status?, extend_days?` |
| PATCH | `/organizations/:id` (branding) | org_admin | JSON `{ accent?, branding? }` or multipart with `logo` file (Cloudinary) |
