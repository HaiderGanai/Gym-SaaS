# Server Endpoint Test Report

**Server:** `http://178.128.54.158:4000/api/v1` · **Date:** 2026-07-13
**Method:** Live end-to-end test — org signup → Stripe Checkout paid with test card `4242 4242 4242 4242` (automated headless browser) → webhooks → gyms → staff invites (tokens read from real invite emails) → members → membership billing → VAT.

**Result: 66 of 66 tested endpoint flows work. No broken endpoints found.** A few deployment config issues need fixing before real use (see "Issues" at the bottom).

---

## Test Accounts Created (IronPeak Fitness)

Org ID: `0efc4fa9-3956-48ad-bbb1-cc35aa831a78` — subscription **active** (Monthly plan, 2 branches, paid via Stripe test card, period ends 2026-08-14).

| Role | Email | Password |
|---|---|---|
| org_admin | `ganaiihaider07+orgadmin@gmail.com` | `OrgAdmin123!` |
| gym_manager | `ganaiihaider07+manager@gmail.com` | `Manager123!` |
| front_desk | `ganaiihaider07+frontdesk@gmail.com` | `FrontDesk123!` |
| member (self-registered) | `ganaiihaider07+member1@gmail.com` | `Member123!` |
| member (staff-invited) | `ganaiihaider07+member2@gmail.com` | `Member456!` |

All `+alias` emails deliver to `ganaiihaider07@gmail.com`, so every invite/OTP/invoice email from testing is in that inbox.

| Resource | ID |
|---|---|
| Gym 1 — IronPeak Central (VAT 20%, GB123456789) | `17e25016-bb41-41f1-bd5e-1174d03fb67a` |
| Gym 2 — IronPeak North | `76c5d06a-d343-4a82-b6f3-38497b8a15d7` |
| Membership plan — Gold Monthly £50 | `4a7bdd4b-bcaf-4828-bd3a-ea0da3b38a36` |
| Discount — WELCOME10 (10%, max 50 uses) | `924ac911-4b78-4aa7-84ff-d5384084d604` |
| Org platform subscription | `aa573fca-6d40-40e0-9040-9f0c31a1322c` |

Manager and front_desk have gym access to Gym 1 only (list scoping verified).

---

## Results by Module

### Auth — ✅ all working
| Endpoint | Result |
|---|---|
| POST /auth/staff/login | ✅ (super_admin, org_admin, manager, front_desk) |
| POST /auth/member/login | ✅ |
| POST /auth/org/signup | ✅ org created `pending` + JWT returned |
| POST /auth/staff/invite/accept | ✅ token from real invite email |
| POST /auth/member/invite/accept | ✅ token from real invite email |
| POST /auth/staff/forgot-password + reset-password | ✅ OTP emailed, reset OK |
| POST /auth/member/forgot-password + reset-password | ✅ |
| POST /auth/staff/change-password/send-otp + change-password | ✅ |
| POST /auth/member/change-password/send-otp + change-password | ✅ |

### Platform billing (Stripe) — ✅ all working
| Endpoint | Result |
|---|---|
| GET /platform/plans | ✅ 3 plans (Monthly £49.99 / Quarterly £44.99 / Yearly £39.99 per branch) |
| GET /platform/plans/all (super) | ✅ |
| POST /platform/billing/checkout | ✅ Checkout URL; **paid with 4242 test card → success** |
| POST /platform/billing/webhook | ✅ all events accepted (201): checkout.session.completed, invoice.paid, customer.subscription.created/updated, etc. |
| GET /platform/billing/subscription | ✅ `pending → active` after payment, correct period end |
| Subscription lock (interceptor) | ✅ 403 on /gyms while `pending`; unlocked after payment |
| Branch limit | ✅ 2nd gym blocked at branch_count=1 |
| POST /platform/billing/quantity | ✅ upgraded 1→2 branches (Stripe prorated), 2nd gym then allowed |
| GET/POST/PATCH/DELETE /platform/billing/payment-methods | ✅ list, attach (`pm_card_visa`), set default, detach |
| GET /platform/subscriptions (super) | ✅ |
| PATCH /platform/subscriptions/:id (super) | ✅ `extend_days: 1` pushed period end +1 day |
| POST /platform/billing/cancel | ⏸ not tested (would schedule cancellation of the live test sub) |

### Organizations & Gyms — ✅ all working
| Endpoint | Result |
|---|---|
| GET /organizations (super) | ✅ |
| GET /organizations/:id (org_admin) | ✅ |
| PATCH /organizations/:id | ✅ branding merge works (`accent` + `branding.font` stored) |
| POST /gyms | ✅ ×2, with VAT config |
| GET /gyms | ✅ scoped — manager sees only Gym 1 |
| GET /gyms/:id | ✅ |
| PATCH /gyms/:id (manager) | ✅ |
| DELETE /organizations/:id, DELETE /gyms/:id | ⏸ not tested (destructive) |

### Staff — ✅ all working
| Endpoint | Result |
|---|---|
| POST /staff/invite | ✅ ×2, emails delivered |
| GET /staff | ✅ |
| GET /staff/:id | ✅ (self-view as front_desk) |
| PATCH /staff/:id | ✅ deactivate → reactivate |
| POST /staff/:id/gym-access | ✅ |
| DELETE /staff/:id/gym-access/:gymId | ✅ grant then revoke on Gym 2 |

### Members — ✅ all working
| Endpoint | Result |
|---|---|
| POST /members/register (public) | ✅ |
| POST /members/invite (front_desk) | ✅ |
| POST /members/waiver | ✅ — note: `signature_url` is **required** (not in docs) |
| GET /members | ✅ scoped |
| GET /members/me, PATCH /members/me | ✅ |
| GET /members/:id | ✅ |
| PATCH /members/:id/status | ✅ pause (with dates) → reactivate |

### Member billing: plans / discounts / subscriptions / invoices / VAT — ✅ all working
| Endpoint | Result |
|---|---|
| POST /plans, GET /plans, PATCH /plans/:id, DELETE /plans/:id | ✅ (PATCH returns `active_subscriptions`; DELETE soft-archives) |
| POST /discounts, GET /discounts, PATCH /discounts/:id, DELETE /discounts/:id | ✅ (used_count incremented; DELETE deactivates) |
| POST /subscriptions (with promo) | ✅ math correct: £50 −10% = £45 net + £9 VAT = **£54**, invoice INV-2026-00001 auto-created `pending` |
| POST /subscriptions (mark_paid, card/cash) | ✅ invoice created `paid` |
| GET /subscriptions (+filters), GET /subscriptions/:id, GET /subscriptions/me | ✅ |
| POST /subscriptions/:id/renew | ✅ full price (no promo): £60, new invoice |
| PATCH pause / resume / cancel | ✅; re-subscribe after cancel also works |
| GET /invoices (+filters), GET /invoices/:id, GET /invoices/me | ✅ sequential numbering INV-2026-00001…00004 |
| PATCH /invoices/:id/pay | ✅ cash payment recorded |
| PATCH /invoices/:id/refund | ✅ org_admin OK; front_desk correctly gets **403** |
| POST /invoices/:id/resend | ✅ email delivered |
| POST /vat/summaries | ✅ July: gross £114 / net £95 / VAT £19 / 2 invoices — refunded invoice correctly excluded |
| GET /vat/summaries (manager) | ✅ |
| PATCH /vat/summaries/:id/file | ✅ |
| GET /vat/org-rollup | ✅ per-gym + totals |

### Not implemented yet (per roadmap, confirmed 404): ClassSchedule, Bookings, Reports.

---

## Issues Found (config, not code)

1. **`FRONTEND_URL` on the server is `http://localhost:3000`.** Stripe success/cancel redirects and all invite-email links point to localhost — broken for anyone not on the server. Set it to your real frontend URL in the server `.env` and restart.
2. **Stripe webhooks reach the server only through my temporary `stripe listen` forward from the dev machine.** Once that stops, paid checkouts will never activate subscriptions. Fix: in the Stripe Dashboard add a webhook endpoint → `http://178.128.54.158:4000/api/v1/platform/billing/webhook` (events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`), then put its `whsec_…` signing secret into the server `.env` as `STRIPE_WEBHOOK_SECRET` and restart.
3. **`POST /members/waiver` requires `signature_url`** — undocumented in CLAUDE.md/API docs; frontend must send it.
4. Minor: the card saved during Checkout is stored with `is_default: false`; consider defaulting the first card.
5. Not tested (needs simulated failure/time): grace-period flow (`invoice.payment_failed` → 3-day grace → expiry cron), past_due daily cron, platform cancel, hard deletes.
