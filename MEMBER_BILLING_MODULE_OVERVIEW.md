# Member Billing Chain — Overview (the *why*)

Companion to `MEMBER_BILLING_POSTMAN_ENDPOINTS.md` (the *how to test*). This covers the four modules that handle the **member → gym** money flow: Plans, Subscriptions, Invoices, VAT.

> Not to be confused with **platform billing** (`PlatformBillingModule`) — that's orgs paying the super_admin via Stripe. The two layers share nothing.

## The big decision: manual billing (v1)

No payment processor is wired up for members yet. The front desk collects cash/card in person and records it in the system:

- Creating a subscription generates a **pending invoice** — the system's "money owed" record.
- Front desk collects payment and hits `PATCH /invoices/:id/pay` (or passes `mark_paid: true` at creation to do both in one call).
- `MembershipPlan.stripe_price_id`, `MemberSubscription.stripe_subscription_id` / `gocardless_mandate_id`, and `Invoice.stripe_payment_intent_id` columns already exist but stay `NULL` — online billing plugs into the same records later without a schema change.

## The chain, end to end

```
MembershipPlan (what a gym sells)
   └── MemberSubscription (a member on a plan, with period dates)
          └── Invoice (one per period, VAT broken down, paid manually)
                 └── VatPeriodSummary (paid invoices aggregated per gym per period)
```

1. **Org admin defines plans** per gym — monthly / weekly / yearly / pay-as-you-go / class pack — plus optional discount codes.
2. **Staff subscribes a member** (front desk can too): pick member + plan, optionally apply a promo code. The subscription is created `active` with period dates computed from the plan type, and the **first invoice is generated automatically** with the VAT breakdown.
3. **Invoice is settled manually** — mark paid (cash/card/other), refund, or resend by email.
4. **Renewal is manual too**: `POST /subscriptions/:id/renew` advances the period and issues the next invoice. A daily 8:00 cron flags recurring subscriptions whose period lapsed without renewal as `past_due`. Paying the invoice of a `past_due` subscription re-activates it.
5. **VAT summaries**: org admin generates a stored `VatPeriodSummary` per gym per month/quarter from paid invoices, and can mark it filed. The org-wide rollup is a live query (`GET /vat/org-rollup`), never a stored record.

## Design choices worth knowing

**Subscription is created `active`, invoice starts `pending`.**
Manual billing means the member is standing at the desk — access starts now, the invoice tracks the money. Pass `mark_paid: true` (+ `payment_method`) when cash changed hands already.

**Tax math lives in one place: `VatService.computeTax()`.**
Rate resolution: plan's `vat_rate_override` → gym's `default_tax_rate`; zero if the plan is VAT-exempt or the gym's `tax_mode` is `none`. Gyms with `tax_inclusive: true` (UK default): the plan price already contains VAT, so net is derived (`gross / 1.2`). Exclusive gyms: tax is added on top.

**Discounts are first-invoice-only promo codes.**
Applied by code at subscription creation (`percentage` or `fixed`), usage-counted against `max_uses`, expiry-checked. Renewals charge full plan price. DELETE deactivates (`is_active = false`) instead of removing the row — subscriptions hold FK references to it.

**Plans archive, never delete.**
`DELETE /plans/:id` sets `is_archived` — existing subscriptions keep working, new sign-ups are blocked. `PATCH /plans/:id` returns `active_subscriptions` so the frontend can show the "editing a live plan" warning from the design brief.

**Invoice snapshots.**
`vat_number_snapshot` and a per-gym sequential `invoice_number` (`INV-2026-00042`) are frozen at creation — later changes to gym settings don't rewrite history.

**Period math by plan type.**
weekly +7d, monthly +1mo, yearly +1yr. `payg` / `class_pack` get 1-year validity and never go `past_due` (they don't recur).

**One duplicate guard.**
A member can hold only one ongoing (`active`/`paused`/`past_due`) subscription per gym — cancel first to switch plans.

**Access control reuses the existing scoping pattern** (now shared in `src/common/utils/gym-scope.ts`): super_admin sees all, org_admin sees their org's gyms, gym_manager/front_desk see their assigned `gym_ids` from the JWT.

## Who can do what

| Action | Roles |
|---|---|
| Create/edit/archive plans, create/edit/deactivate discounts | org_admin |
| View plans & discounts | all staff (front desk needs them for sign-up) |
| Create / renew subscription | org_admin, gym_manager, front_desk |
| Pause / resume / cancel subscription | org_admin, gym_manager |
| List/view invoices & subscriptions | all staff (scoped to their gyms) |
| Mark invoice paid, resend invoice email | org_admin, gym_manager, front_desk |
| Refund invoice | org_admin only |
| Generate VAT summary, mark filed, org rollup | org_admin |
| View VAT summaries | org_admin, gym_manager |
| View own subscription / invoices | member (`/subscriptions/me`, `/invoices/me`) |

super_admin bypasses all of the above (RolesGuard short-circuit). All staff routes remain gated by the platform-subscription interceptor — an org with a lapsed SaaS subscription can't touch member billing either.

## Not built (deliberately)

- No online payments for members — Stripe/GoCardless columns are reserved, wiring comes later.
- No auto-generated renewal invoices — renewals are explicit staff actions in a cash workflow; the cron only flags `past_due`.
- No dunning emails / retry timeline — meaningless without automatic charging.
- No credit tracking for class packs — `included_credits` is stored; decrementing belongs to BookingsModule.
- No proration on plan switches — cancel + resubscribe covers v1.
