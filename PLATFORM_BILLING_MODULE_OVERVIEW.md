# Platform Billing Module — Overview

## What this is

A major architectural addition: the platform now bills **organizations**, not just (eventually) members. A gym owner comes to our website, creates their organization, picks a plan (monthly / quarterly / yearly, priced **per branch**), pays through Stripe, and only then gets access to the dashboard — where they can design their organization's app (colors, fonts, branding). When a renewal payment fails they get a **3-day grace period with daily email reminders**; if it lapses, the dashboard locks until they pay.

Member-side billing (members paying their gym) is untouched and remains a future module. The two layers share no entities:

| Concept | Platform layer (this module) | Member layer (future) |
|---|---|---|
| Plan | `PlatformPlan` | `MembershipPlan` |
| Subscription | `OrgSubscription` | `MemberSubscription` |
| Payer | Organization (org_admin) | Member |
| Payee | Super admin (us) | The gym |

## The lifecycle

```
                        POST /auth/org/signup (public)
                                   │
                    Organization created (status: pending)
                    + org_admin StaffUser + JWT issued
                                   │
                    GET /platform/plans → pick one
                                   │
                    POST /platform/billing/checkout
                    { plan_id, branch_count } → Stripe Checkout URL
                                   │
                    ┌── user pays on Stripe's hosted page ──┐
                    │                                        │
              payment succeeds                        user abandons
                    │                                        │
     webhook: checkout.session.completed          org stays 'pending'
     → OrgSubscription active                     (dashboard locked,
     → Organization.subscription_status active     can retry checkout)
                    │
        FULL DASHBOARD ACCESS
        (design branding, create gyms up to branch_count, invite staff…)
                    │
        Stripe auto-renews each period
                    │
      ┌─────────────┴─────────────┐
 invoice.paid                invoice.payment_failed
 (period rolls on)                 │
                          status: grace (access kept)
                          grace_ends_at = +3 days
                          daily 9:00 cron → reminder email to every org_admin
                                   │
                     ┌─────────────┴─────────────┐
                pays within grace           grace lapses
                (invoice.paid →                  │
                 back to active)          status: expired
                                          dashboard locked (403)
                                          only /auth + /platform/billing reachable
```

## Statuses

`SubscriptionStatus` (shared by `OrgSubscription.status` and the denormalized `Organization.subscription_status`):

| Status | Meaning | Dashboard access |
|---|---|---|
| `pending` | Signed up, never paid | ❌ locked |
| `active` | Paid up | ✅ |
| `grace` | Renewal failed, ≤3 days to fix it | ✅ (with daily nag emails) |
| `expired` | Grace lapsed unpaid | ❌ locked |
| `cancelled` | Cancelled and period ended | ❌ locked |

## Access enforcement — `SubscriptionInterceptor`

A single global gate (`APP_INTERCEPTOR`, registered in `PlatformBillingModule`). It runs **after** the route guards (a global guard would run before `StaffJwtGuard` and never see `request.user` — that's why it's an interceptor, not a guard).

Rules:
- No user on the request (public/member routes) → pass.
- `super_admin` → always pass.
- Org staff → org's `subscription_status` must be `active` or `grace`, else **403**.
- Routes/controllers tagged `@SkipSubscriptionCheck()` → pass. Applied to **AuthController** (a locked-out admin must still log in / reset password) and **PlatformBillingController** (they must be able to pay).

## Branch-count pricing

Plans have **one Stripe Price**; the checkout is created with `quantity = branch_count`. Consequences:

- `GymService.create` refuses to create a gym beyond the paid `branch_count` (403 with an upgrade hint). Orgs with no subscription row (seeded/dev, super_admin-created) are not limited.
- `POST /platform/billing/quantity` bumps/lowers the Stripe subscription quantity — Stripe prorates automatically. Lowering below the number of gyms you currently have is rejected.

## Grace cron

`PlatformBillingService.graceCron()` — `@Cron(EVERY_DAY_AT_9AM)`:

1. Safety net: `active` subs whose `current_period_end` passed without a webhook → moved to `grace`.
2. `grace` subs past `grace_ends_at` → `expired`, org locked, final email sent.
3. Remaining `grace` subs → daily reminder email ("N days left") to every active org_admin of the org.

## Super admin tooling

- Plan CRUD (`/platform/plans…`): creating a plan creates the Stripe Product + Price; repricing creates a **new** Price and archives the old (Stripe prices are immutable — existing subscribers keep their old price); DELETE is a soft deactivate.
- `GET /platform/subscriptions`: every org's subscription with org + plan.
- `PATCH /platform/subscriptions/:id`: support escape hatch — `extend_days` comps/extends and re-activates, `status` force-sets a status. Both sync `Organization.subscription_status`.

## Branding

`Organization.branding` is a **jsonb blob** updated through the existing `PATCH /organizations/:id` (org_admin, own org). The frontend owns its shape — colors, text sizes, fonts, whatever the dashboard designer sends. No schema on the backend by design; validation can be added later if a real constraint appears.

## Stripe integration notes

- **Checkout hosted page** (mode `subscription`): we never touch card data — no PCI scope beyond SAQ-A, SCA/3DS handled by Stripe.
- **Webhook is the source of truth.** Signature-verified with `STRIPE_WEBHOOK_SECRET` against the raw request body (`main.ts` now boots Nest with `rawBody: true`).
- Handled events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- SDK v22 / 2025+ API: `current_period_end` moved onto subscription items and `invoice.subscription` moved under `invoice.parent.subscription_details` — both are read through tolerant helpers (`periodEnd()`, `invoiceSubId()`) that support old and new shapes.
- Payment-method CRUD works directly against the org's Stripe Customer: list / attach (`pm_card_visa` etc. in test mode) / set default / detach, with an ownership check on detach.

## New environment variables

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from `stripe listen` in dev
```
