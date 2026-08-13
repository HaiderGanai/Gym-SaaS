# Platform Billing — What Changed (file by file)

Companion to `PLATFORM_BILLING_MODULE_OVERVIEW.md` (the *why*). This is the *what*: every file added or modified for the org → super_admin billing layer.

## New dependency

```
npm install stripe        # official Stripe SDK (v22)
```

## New files

| File | Purpose |
|---|---|
| `src/platform-billing/platform-billing.module.ts` | Module; registers `SubscriptionInterceptor` as global `APP_INTERCEPTOR` |
| `src/platform-billing/platform-billing.controller.ts` | All `/platform/*` routes: plans CRUD, checkout, subscription, quantity, cancel, payment-method CRUD, webhook, super_admin subscription admin |
| `src/platform-billing/platform-billing.service.ts` | Stripe client, all billing logic, webhook handlers, daily grace cron (`@Cron` 9:00) |
| `src/platform-billing/subscription.interceptor.ts` | Global dashboard lock for orgs that aren't `active`/`grace` |
| `src/platform-billing/entities/platform-plan.entity.ts` | `PlatformPlan` (+ `PlanInterval` enum) — plans orgs buy from us |
| `src/platform-billing/entities/org-subscription.entity.ts` | `OrgSubscription` — the org's live subscription (old rows kept as history) |
| `src/platform-billing/entities/subscription-status.enum.ts` | `SubscriptionStatus` — shared enum, own file to avoid an import cycle with `Organization` |
| `src/platform-billing/dto/*.ts` | `create-plan`, `update-plan`, `checkout`, `update-quantity`, `attach-payment-method`, `admin-update-subscription` |
| `src/common/decorators/skip-subscription.decorator.ts` | `@SkipSubscriptionCheck()` — exempts a route/controller from the lock |
| `src/auth/dto/org-signup.dto.ts` | Body for `POST /auth/org/signup` |

## Modified files

| File | Change |
|---|---|
| `src/organization/entities/organization.entity.ts` | + `subscription_status` (enum, default `pending`, denormalized from `OrgSubscription`) and + `branding` (jsonb, nullable — org app theme) |
| `src/organization/dto/update-organization.dto.ts` | + optional `branding` object, so org_admin updates their theme via existing `PATCH /organizations/:id` |
| `src/auth/auth.controller.ts` | + `POST /auth/org/signup` (public); class tagged `@SkipSubscriptionCheck()` so locked-out admins can still log in / reset passwords |
| `src/auth/auth.service.ts` | + `orgSignup()` — creates Organization (`pending`) + org_admin + JWT |
| `src/auth/auth.module.ts` | + `TypeOrmModule.forFeature([Organization, StaffUser])` for signup |
| `src/gym/gym.service.ts` | + `assertBranchQuota()` — `POST /gyms` blocked past the paid `branch_count` (orgs with no subscription row are not limited) |
| `src/gym/gym.module.ts` | + `OrgSubscription` repository |
| `src/communication/mail.service.ts` | + `sendSubscriptionReminder(email, orgName, daysLeft)` — grace countdown / expired notice |
| `src/main.ts` | `NestFactory.create(AppModule, { rawBody: true })` — Stripe webhook signature needs the raw body |
| `src/app.module.ts` | + `PlatformBillingModule` |
| `seed.js` | Seed org now inserted with `subscription_status = 'active'` (so the dev org_admin isn't locked out) |
| `CLAUDE.md` | Module map, build status, endpoints table, key files, architecture decisions, env vars |

## Behavioral changes to watch

1. **Existing dev databases**: TypeORM synchronize adds `organizations.subscription_status` with default `'pending'` → your existing seeded org_admin (`owner@test.com`) gets 403 on everything until you run:
   ```sql
   UPDATE organizations SET subscription_status = 'active';
   ```
2. **All org-staff routes are now subscription-gated** (org_admin, gym_manager, front_desk). Members, super_admin, `/auth/*`, and `/platform/*` are unaffected.
3. **`POST /gyms` can now 403** for org_admins whose plan doesn't cover another branch.
4. Two new required env vars in dev: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

## Not built (deliberately)

- No frontend card form (Stripe Checkout hosts payment; a SetupIntent endpoint can be added when the dashboard needs an embedded card form).
- No branding schema validation — jsonb blob, frontend owns the shape.
- No plan-change (upgrade monthly→yearly) endpoint — cancel + re-checkout covers v1; add `stripe.subscriptions.update` with the new price when needed.
- No Stripe Customer Portal — our own payment-method CRUD covers v1; the portal is one API call if we ever want it.
