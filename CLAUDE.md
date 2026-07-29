# Gym SaaS — Project Reference

## 1. Project Overview

Multi-tenant gym management SaaS built by InfinityBits. A single deployment serves multiple fitness organizations (e.g., a gym chain). Each organization owns one or more gym branches. The platform handles staff management, member onboarding, class scheduling and bookings, membership subscriptions, invoicing with VAT, and AI-generated reports.

**Platform ownership**: A `super_admin` role (platform-level, no org affiliation) sits above all organizations and can see across all tenants.

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (TypeScript) |
| Framework | NestJS 11 |
| Database | PostgreSQL |
| ORM | TypeORM 1.x (autoLoadEntities, synchronize off in production) |
| Auth | Passport.js + passport-jwt, @nestjs/jwt |
| Password hashing | bcrypt |
| Validation | class-validator + class-transformer |
| Email | Nodemailer (Gmail SMTP) |
| Payments (platform) | Stripe (Checkout + Subscriptions + webhooks) |
| Scheduling | @nestjs/schedule (cron) |
| Recurrence | rrule (RFC 5545 expansion for class templates) |
| Config | @nestjs/config (env vars) |

## 3. Role Hierarchy

```
super_admin          ← platform owner; no org_id in JWT; bypasses all @Roles checks
  └── org_admin      ← full control of one organization + all its branches
        └── gym_manager   ← manages a single branch
              └── front_desk    ← check-in, member look-up, POS
```

- `super_admin` has `organization_id = NULL` in DB and `org_id = null` in JWT.
- `RolesGuard` short-circuits to `true` for `super_admin` before checking `@Roles(...)`.
- `org_admin` bypasses `StaffGymAccess` checks — org-wide authority without junction rows.

## 4. Tenant Hierarchy

```
Organization
  └── Gym (branch)
        ├── StaffUser  ←→ Gym via StaffGymAccess (many-to-many)
        └── Member     ←→ Gym via MemberGymAccess (many-to-many)
```

- **Organization** is the root tenant.
- **Gym** is the operational unit. Plans, slots, invoices, subscriptions, and reports all carry a `gym_id`.

## 5. Module Map

| Module | Responsibility |
|---|---|
| `OrganizationModule` | CRUD for organizations; org-level settings |
| `GymModule` | CRUD for gym branches; VAT number, branch details |
| `StaffModule` | Staff invite flow; gym access grants |
| `AuthModule` | JWT issue/validation; all login + invite-accept endpoints |
| `MembersModule` | Member registration; invite flow; waiver signing; gym access |
| `PlansModule` | MembershipPlan CRUD; Discount codes per gym |
| `SubscriptionsModule` | Create/pause/cancel member subscriptions |
| `InvoicesModule` | Invoice generation; dunning queue; status transitions |
| `VatModule` | VAT calculation; VatPeriodSummary aggregation per gym |
| `ClassScheduleModule` | SlotTemplate (RRULE) management; Slot instance generation |
| `BookingsModule` | Booking creation; waitlist; QR check-in via signed JWT |
| `CommunicationModule` | `MailService` (Nodemailer) — the email half of every notification; owns `NotificationLog` entity definition |
| `NotificationsModule` | The full member communication layer: pairs every member-facing email with a push notification (Firebase) and an in-app inbox row, automated pre-class booking reminders (cron), staff announcement broadcast, member notification inbox + device-token registration |
| `ReportsModule` | Live statistics for staff dashboards: revenue, bookings, attendance, no-shows, fill rate, churn — per gym and org-wide rollup. End-of-day digest email to every org_admin. No AI/LLM — pure SQL aggregation |
| `PlatformBillingModule` | **Platform-level billing**: orgs pay the super_admin via Stripe. Platform plans (monthly/quarterly/yearly, priced per branch), checkout, webhooks, payment-method CRUD, grace-period cron, subscription lock (SubscriptionInterceptor) |

## 6. Build Status

### Complete
- [x] **All entities** — see entity list below; `invite_token` + `invite_expires_at` added to Member
- [x] **AuthModule** — staff login, member login, staff invite accept, member invite accept
- [x] **StaffModule (partial)** — `POST /staff/invite` (org_admin / gym_manager)
- [x] **MembersModule (partial)** — self-register, staff-invite flow, waiver signing
- [x] **CommunicationModule (partial)** — `MailService` (staff invite email, member invite email)
- [x] **OrganizationModule** — full CRUD (5 endpoints); super_admin creates/lists/deletes, org_admin reads/updates own org
- [x] **GymModule** — full CRUD (5 endpoints); role-scoped list; org_admin + gym_manager can update; only super_admin/org_admin can delete; branches carry a `type` (`general_gym`/`swimming`/`boxing`/`karate`/`mma`, defaults `general_gym`), surfaced on every gym response plus `GET /organizations/:id` and every login/invite-accept response — role-scoped there: org_admin sees every branch (`gyms`), everyone else sees only their own affiliated branch(es) (`branch`)
- [x] **StaffModule (expanded)** — list, profile, update role/active, grant/revoke gym access (6 endpoints total)
- [x] **MembersModule (expanded)** — list members, member profile (staff), member self-profile + self-update, update member status/pause/cancel (8 endpoints total)
- [x] **PlatformBillingModule** — org self-signup, platform plan CRUD (Stripe Product/Price), Stripe Checkout, webhook handling, payment-method CRUD, branch-quantity upgrades, cancel, super_admin subscription admin, 3-day grace period with daily reminder cron, org branding (jsonb), subscription access lock
- [x] **Member billing chain (manual v1)** — PlansModule (plan + discount CRUD), SubscriptionsModule (staff-led subscribe with promo code, renew, pause/resume/cancel, daily past_due cron), InvoicesModule (auto-generated per period, manual pay/refund/resend, VAT breakdown, per-gym invoice numbers), VatModule (tax calc, stored per-gym period summaries, live org rollup). No member payment processor — front desk collects cash/card and marks invoices paid. See `MEMBER_BILLING_MODULE_OVERVIEW.md` + `MEMBER_BILLING_POSTMAN_ENDPOINTS.md`.
- [x] **ClassScheduleModule** — SlotTemplate CRUD (RRULE recurring patterns), slot materialization (on create + manual `/generate` + daily 2:00 cron, 30-day rolling horizon, idempotent), one-off slots, "this occurrence only" vs `apply_to_future` edits, disable/enable with member email notification, instructor overlap checks, member slot browse with computed booking metadata. See `CLASS_SCHEDULE_MODULE_OVERVIEW.md` + `CLASS_SCHEDULE_POSTMAN_ENDPOINTS.md`.
- [x] **BookingsModule** — member booking with layered gates (active member + gym access + active subscription at the gym + booking window + credits), atomic capacity claim, waitlist with auto-promotion + email, member/staff cancel (cutoff vs override), no-show marking, class check-in QR (expires with the slot) and gym-door entry QR (expires with the subscription period, live-revoked on pause/cancel), scanner-friendly `POST /checkin/*` endpoints. Owns all `Slot.booking_count` mutations. See `BOOKINGS_MODULE_OVERVIEW.md` + `BOOKINGS_POSTMAN_ENDPOINTS.md`.
- [x] **CommunicationModule + NotificationsModule** — every member-facing event (waitlist promotion, slot disabled, invoice ready, pre-class reminder, staff announcement) fires through one dispatcher that sends email (Nodemailer) + push (Firebase Cloud Messaging) + writes one `NotificationLog` row, independently best-effort per channel. Automated booking reminders (15-min cron, 2h lead time) is the previously-missing MVP feature from the feature spec. Member notification inbox (list/unread-count/mark-read/mark-all-read) + device-token registration (`POST/DELETE /notifications/device-token`). Staff announcement broadcast (`POST /communication/broadcast`) to a gym's members (all or a picked list). Owns `Booking.reminder_sent_at`. See `COMMUNICATION_MODULE_OVERVIEW.md` + `COMMUNICATION_POSTMAN_ENDPOINTS.md`.
- [x] **ReportsModule** — live per-gym stats (`GET /reports/gyms/:gymId/stats`) and org-wide rollup + per-gym breakdown (`GET /reports/org/stats`): revenue (+ payment-method split), bookings, attendance/fill-rate, no-show rate, new members, churn rate — all `?period_start=&period_end=`, computed on request, nothing stored. Daily 23:55 cron emails every active org_admin an end-of-day digest (today's revenue, bookings, new members, cancelled subscriptions) via `MailService.sendDailyDigest()` directly (org_admin is staff, not a member — bypasses `NotificationsService`). No AI/LLM summarization — deliberately deferred from the feature spec's "AI daily report." See `REPORTS_MODULE_OVERVIEW.md` + `REPORTS_POSTMAN_ENDPOINTS.md`.

### Active Endpoints

All routes are prefixed with `/api/v1`. Base URL in dev: `http://localhost:3000/api/v1`.

| Method | Path | Guard | Who |
|---|---|---|---|
| POST | `/auth/staff/login` | Public | Any staff — returns `access_token` + `organization` branding block (null for super_admin) |
| POST | `/auth/member/login` | Public | Any member — returns `access_token` + `organization` branding block (via primary gym) |
| POST | `/auth/staff/invite/accept` | Public | Invited staff (via email link) — same response shape as login |
| POST | `/auth/member/invite/accept` | Public | Invited member (via email link) — same response shape as login |
| POST | `/auth/staff/forgot-password` | Public | Any staff — sends 6-digit OTP to email |
| POST | `/auth/staff/reset-password` | Public | `{ email, otp, password }` — verifies OTP, resets |
| POST | `/auth/staff/change-password/send-otp` | StaffJwt | Sends OTP to logged-in staff's email |
| POST | `/auth/staff/change-password` | StaffJwt | `{ otp, new_password }` — verifies OTP, changes |
| POST | `/auth/member/forgot-password` | Public | Any member — sends 6-digit OTP to email |
| POST | `/auth/member/reset-password` | Public | `{ email, otp, password }` — verifies OTP, resets |
| POST | `/auth/member/change-password/send-otp` | MemberJwt | Sends OTP to logged-in member's email |
| POST | `/auth/member/change-password` | MemberJwt | `{ otp, new_password }` — verifies OTP, changes |
| POST | `/staff/invite` | StaffJwt + Roles(org_admin, gym_manager) | Authenticated staff |
| POST | `/members/register` | Public | Self-registering member |
| POST | `/members/invite` | StaffJwt + Roles(gym_manager, front_desk) | Staff inviting a member |
| POST | `/members/waiver` | MemberJwt | Authenticated member |
| POST | `/organizations` | StaffJwt + Roles(super_admin) | Create org |
| GET | `/organizations` | StaffJwt + Roles(super_admin) | List all orgs |
| GET | `/organizations/:id` | StaffJwt + Roles(org_admin, gym_manager, front_desk) | Any staff of that org (own org only, checked server-side); org_admin/super_admin get full `gyms` (every branch), gym_manager/front_desk get `branch` (their own affiliated branch(es) only) |
| PATCH | `/organizations/:id` | StaffJwt + Roles(org_admin) | super_admin or own org_admin |
| DELETE | `/organizations/:id` | StaffJwt + Roles(super_admin) | super_admin only |
| POST | `/gyms` | StaffJwt + Roles(org_admin) | super_admin (needs org_id in body) or org_admin; `type?` — one of `general_gym\|swimming\|boxing\|karate\|mma`, defaults `general_gym` |
| GET | `/gyms` | StaffJwt | All staff — result scoped by role |
| GET | `/gyms/:id` | StaffJwt | All staff — service checks access |
| PATCH | `/gyms/:id` | StaffJwt + Roles(org_admin, gym_manager) | super_admin, org_admin (own org), gym_manager (assigned); `type?` accepted same as create |
| DELETE | `/gyms/:id` | StaffJwt + Roles(org_admin) | super_admin or org_admin (own org) |
| GET | `/staff` | StaffJwt | All staff — result scoped by role |
| GET | `/staff/:id` | StaffJwt | super_admin, org_admin (own org), gym colleagues, self |
| PATCH | `/staff/:id` | StaffJwt + Roles(org_admin) | Update role / deactivate; org_admin cannot promote to super_admin |
| POST | `/staff/:id/gym-access` | StaffJwt + Roles(org_admin, gym_manager) | Grant gym access; gym_manager limited to own gyms |
| DELETE | `/staff/:id/gym-access/:gymId` | StaffJwt + Roles(org_admin, gym_manager) | Revoke gym access; gym_manager limited to own gyms; sets is_active=false + revoked_at |
| GET | `/members` | StaffJwt | All staff — result scoped by role (super_admin=all, org_admin=own org gyms, gym_manager/front_desk=assigned gyms) |
| GET | `/members/me` | MemberJwt | Member views own profile + active gym access |
| GET | `/members/:id` | StaffJwt | Staff views member profile + full gym access history |
| PATCH | `/members/me` | MemberJwt | Member updates own full_name / phone / photo_url |
| PATCH | `/members/:id/status` | StaffJwt + Roles(org_admin, gym_manager) | Pause (with dates) / cancel / reactivate member |
| POST | `/auth/org/signup` | Public | Org self-signup: creates Organization (`pending`) + org_admin, returns JWT |
| GET | `/platform/plans` | Public | List active platform plans (pricing page) |
| GET | `/platform/plans/all` | StaffJwt + Roles(super_admin) | All plans incl. deactivated |
| POST | `/platform/plans` | StaffJwt + Roles(super_admin) | Create plan → creates Stripe Product + Price |
| PATCH | `/platform/plans/:id` | StaffJwt + Roles(super_admin) | Rename / reprice (new Stripe Price) / toggle active |
| DELETE | `/platform/plans/:id` | StaffJwt + Roles(super_admin) | Deactivate plan (soft) |
| POST | `/platform/billing/checkout` | StaffJwt + Roles(org_admin) | `{ plan_id, branch_count }` → Stripe Checkout URL |
| GET | `/platform/billing/subscription` | StaffJwt + Roles(org_admin) | Own org's current subscription + plan |
| POST | `/platform/billing/quantity` | StaffJwt + Roles(org_admin) | `{ branch_count }` — upgrade/downgrade paid branches (Stripe prorates) |
| POST | `/platform/billing/cancel` | StaffJwt + Roles(org_admin) | Cancel at period end |
| GET | `/platform/billing/payment-methods` | StaffJwt + Roles(org_admin) | List saved cards |
| POST | `/platform/billing/payment-methods` | StaffJwt + Roles(org_admin) | `{ payment_method_id, set_default? }` — attach card |
| PATCH | `/platform/billing/payment-methods/:id/default` | StaffJwt + Roles(org_admin) | Set default card |
| DELETE | `/platform/billing/payment-methods/:id` | StaffJwt + Roles(org_admin) | Detach card |
| POST | `/platform/billing/webhook` | Public (Stripe signature) | Stripe events: checkout completed, invoice paid/failed, sub updated/deleted |
| GET | `/platform/subscriptions` | StaffJwt + Roles(super_admin) | All org subscriptions (orgs + plans) |
| PATCH | `/platform/subscriptions/:id` | StaffJwt + Roles(super_admin) | Comp/extend (`extend_days`) or force `status` |
| POST | `/plans` | StaffJwt + Roles(org_admin) | Create membership plan for a gym |
| GET | `/plans` | StaffJwt | List plans (scoped); `?gym_id=`, `?include_archived=true` |
| GET | `/plans/:id` | StaffJwt | Single plan |
| PATCH | `/plans/:id` | StaffJwt + Roles(org_admin) | Update; response includes `active_subscriptions` count |
| DELETE | `/plans/:id` | StaffJwt + Roles(org_admin) | Archive (soft) |
| POST | `/discounts` | StaffJwt + Roles(org_admin) | Create promo code (percentage/fixed) per gym |
| GET | `/discounts` | StaffJwt | List discounts (scoped); `?gym_id=` |
| PATCH | `/discounts/:id` | StaffJwt + Roles(org_admin) | Update value/max_uses/expires_at/is_active |
| DELETE | `/discounts/:id` | StaffJwt + Roles(org_admin) | Deactivate (soft — subscriptions reference it) |
| POST | `/subscriptions` | StaffJwt + Roles(org_admin, gym_manager, front_desk) | Subscribe member to plan; auto-creates first invoice; `discount_code?`, `mark_paid?`, `payment_method?` |
| GET | `/subscriptions` | StaffJwt | List (scoped); `?gym_id=&member_id=&status=` |
| GET | `/subscriptions/me` | MemberJwt | Member's own subscriptions + plan |
| GET | `/subscriptions/:id` | StaffJwt | Detail with plan/member/discount/invoices |
| POST | `/subscriptions/:id/renew` | StaffJwt + Roles(org_admin, gym_manager, front_desk) | Advance period + next invoice (full price, no promo) |
| PATCH | `/subscriptions/:id/pause` | StaffJwt + Roles(org_admin, gym_manager) | active → paused |
| PATCH | `/subscriptions/:id/resume` | StaffJwt + Roles(org_admin, gym_manager) | paused → active |
| PATCH | `/subscriptions/:id/cancel` | StaffJwt + Roles(org_admin, gym_manager) | → cancelled (permanent) |
| GET | `/invoices` | StaffJwt | List (scoped); `?gym_id=&member_id=&status=` |
| GET | `/invoices/me` | MemberJwt | Member's own invoice history |
| GET | `/invoices/:id` | StaffJwt | Full detail: member, subscription+plan, gym, VAT breakdown |
| PATCH | `/invoices/:id/pay` | StaffJwt + Roles(org_admin, gym_manager, front_desk) | Manual mark-paid `{ payment_method?: cash\|card\|other }`; re-activates past_due sub |
| PATCH | `/invoices/:id/refund` | StaffJwt + Roles(org_admin) | paid → refunded |
| POST | `/invoices/:id/resend` | StaffJwt + Roles(org_admin, gym_manager, front_desk) | Email invoice to member |
| POST | `/vat/summaries` | StaffJwt + Roles(org_admin) | Generate stored period summary from paid invoices |
| GET | `/vat/summaries` | StaffJwt + Roles(org_admin, gym_manager) | List summaries (scoped); `?gym_id=` |
| PATCH | `/vat/summaries/:id/file` | StaffJwt + Roles(org_admin) | Mark filed (`is_filed` + `filed_at`) |
| GET | `/vat/org-rollup` | StaffJwt + Roles(org_admin) | Live org-wide rollup; `?period_start=&period_end=` |
| POST | `/schedule/templates` | StaffJwt + Roles(org_admin, gym_manager) | Create recurring template; materializes slots (default 30 days, `generate_until?`) |
| GET | `/schedule/templates` | StaffJwt | List templates (scoped); `?gym_id=`, `?include_inactive=true`; each includes computed `generated_until` + `future_slots` |
| GET | `/schedule/templates/:id` | StaffJwt | Single template with instructor + `generated_until`/`future_slots` |
| PATCH | `/schedule/templates/:id` | StaffJwt + Roles(org_admin, gym_manager) | Update; `apply_to_future: true` propagates to future slots (timing changes regenerate empty slots, booked ones kept) |
| DELETE | `/schedule/templates/:id` | StaffJwt + Roles(org_admin, gym_manager) | Deactivate (soft); removes future empty slots, keeps booked |
| POST | `/schedule/templates/:id/generate` | StaffJwt + Roles(org_admin, gym_manager) | `{ until }` — extend materialized window (idempotent, max 366 days); response reports new `generated_until` |
| POST | `/schedule/slots` | StaffJwt + Roles(org_admin, gym_manager) | One-off custom slot; 409 on instructor overlap |
| GET | `/schedule/slots` | StaffJwt | Calendar (scoped); `?gym_id=&from=&to=&status=&template_id=` (default today → +30d) |
| GET | `/schedule/slots/browse` | MemberJwt | Enabled future slots in member's gyms + `spots_remaining`/`is_full`/`booking_open` etc. |
| GET | `/schedule/slots/:id` | StaffJwt | Slot detail + roster preview (bookings with member info) |
| PATCH | `/schedule/slots/:id` | StaffJwt + Roles(org_admin, gym_manager) | Edit this occurrence only; 409 if capacity < bookings or instructor overlap |
| PATCH | `/schedule/slots/:id/disable` | StaffJwt + Roles(org_admin, gym_manager) | Disable + email confirmed/waitlisted members |
| PATCH | `/schedule/slots/:id/enable` | StaffJwt + Roles(org_admin, gym_manager) | Re-enable |
| DELETE | `/schedule/slots/:id` | StaffJwt + Roles(org_admin, gym_manager) | Hard delete — only when slot has zero bookings |
| POST | `/bookings` | MemberJwt | Book a slot `{ slot_id }`; confirmed (with QR) or waitlisted when full |
| GET | `/bookings/me` | MemberJwt | Own upcoming bookings + QR tokens; `?include_past=true` |
| PATCH | `/bookings/:id/cancel` | MemberJwt | Cancel own booking (respects `cancellation_cutoff_hours`); frees spot → waitlist promotion |
| GET | `/bookings` | StaffJwt | List/roster (scoped); `?gym_id=&slot_id=&member_id=&status=` |
| PATCH | `/bookings/:id/staff-cancel` | StaffJwt | Cutoff-free cancel (front-desk override); runs promotion |
| PATCH | `/bookings/:id/no-show` | StaffJwt | confirmed → no_show, only after class start |
| GET | `/members/me/entry-qr` | MemberJwt | Gym-door entry QR; 403 without active subscription; `?gym_id=` |
| POST | `/checkin/entry` | StaffJwt | Scan entry QR → `{ allowed, reason?, member, subscription? }` (live sub check) |
| POST | `/checkin/booking` | StaffJwt | Scan class QR → marks checked_in; `{ allowed, reason?, member, class }` |
| GET | `/notifications` | MemberJwt | Own notification feed (email+push events); `?unread_only=true` |
| GET | `/notifications/unread-count` | MemberJwt | `{ unread_count }` |
| PATCH | `/notifications/:id/read` | MemberJwt | Mark one notification read |
| PATCH | `/notifications/read-all` | MemberJwt | Mark every unread notification read |
| POST | `/notifications/device-token` | MemberJwt | `{ fcm_token }` — register this device for push |
| DELETE | `/notifications/device-token` | MemberJwt | Clear the device token (e.g. on logout) |
| POST | `/communication/broadcast` | StaffJwt + Roles(org_admin, gym_manager) | `{ gym_id, member_ids?, title, body }` — announcement to a gym's members (all, or a picked list); email + push + inbox |
| GET | `/reports/gyms/:gymId/stats` | StaffJwt + Roles(org_admin, gym_manager) | Live per-gym stats; `?period_start=&period_end=` (required, `period_end` exclusive) |
| GET | `/reports/org/stats` | StaffJwt + Roles(org_admin) | Live org-wide rollup + per-gym breakdown; `?period_start=&period_end=`; super_admin gets 400 (use per-gym instead) |

### Key files

```
src/auth/
  auth.module.ts, auth.controller.ts, auth.service.ts
  strategies/staff-jwt.strategy.ts, member-jwt.strategy.ts
  guards/staff-jwt.guard.ts, member-jwt.guard.ts, roles.guard.ts
  decorators/public.decorator.ts, roles.decorator.ts, current-user.decorator.ts
  dto/staff-login.dto.ts, member-login.dto.ts, accept-invite.dto.ts

src/common/interfaces/jwt-payload.interface.ts

src/staff/
  staff.module.ts, staff.controller.ts, staff.service.ts
  entities/staff-user.entity.ts, staff-gym-access.entity.ts
  dto/invite-staff.dto.ts

src/members/
  members.module.ts, members.controller.ts, members.service.ts
  entities/member.entity.ts, member-gym-access.entity.ts, waiver.entity.ts
  dto/register-member.dto.ts, invite-member.dto.ts,
      accept-member-invite.dto.ts, sign-waiver.dto.ts,
      update-member.dto.ts, update-member-status.dto.ts

src/communication/
  communication.module.ts
  mail.service.ts   ← every email template (invite, OTP, invoice, slot-disabled,
      waitlist-promoted, booking-reminder, announcement, subscription-reminder)
  entities/notification-log.entity.ts  ← DeliveryStatus enum; owned here, used by NotificationsModule

src/notifications/
  notifications.module.ts
  notifications.controller.ts  ← NotificationsController (/notifications, member) + CommunicationController (/communication, staff)
  notifications.service.ts     ← notify()/logDelivered() dispatch, typed triggers, booking-reminder cron (*/15 * * * *), broadcastAnnouncement()
  firebase.service.ts          ← FCM wrapper; boots best-effort off FIREBASE_SERVICE_ACCOUNT_PATH, push silently disabled if unset/missing
  dto/register-device-token.dto.ts, broadcast.dto.ts

src/staff/
  staff.module.ts, staff.controller.ts, staff.service.ts
  entities/staff-user.entity.ts, staff-gym-access.entity.ts
  dto/invite-staff.dto.ts, update-staff.dto.ts, grant-gym-access.dto.ts

src/organization/
  organization.module.ts, organization.controller.ts, organization.service.ts
  entities/organization.entity.ts
  dto/create-organization.dto.ts, update-organization.dto.ts

src/gym/
  gym.module.ts, gym.controller.ts, gym.service.ts
  entities/gym.entity.ts
  dto/create-gym.dto.ts, update-gym.dto.ts

src/platform-billing/
  platform-billing.module.ts, platform-billing.controller.ts, platform-billing.service.ts
  subscription.interceptor.ts          ← global APP_INTERCEPTOR: locks dashboard when org not active/grace
  entities/platform-plan.entity.ts, org-subscription.entity.ts, subscription-status.enum.ts
  dto/create-plan.dto.ts, update-plan.dto.ts, checkout.dto.ts, update-quantity.dto.ts,
      attach-payment-method.dto.ts, admin-update-subscription.dto.ts

src/common/decorators/skip-subscription.decorator.ts  ← @SkipSubscriptionCheck() (on AuthController + PlatformBillingController)
src/auth/dto/org-signup.dto.ts        ← org self-signup

src/plans/
  plans.module.ts, plans.controller.ts, plans.service.ts   ← routes: /plans + /discounts
  entities/membership-plan.entity.ts, discount.entity.ts
  dto/create-plan.dto.ts, update-plan.dto.ts, create-discount.dto.ts, update-discount.dto.ts

src/subscriptions/
  subscriptions.module.ts, subscriptions.controller.ts, subscriptions.service.ts  ← past_due cron (8:00 daily)
  entities/member-subscription.entity.ts
  dto/create-subscription.dto.ts, renew-subscription.dto.ts

src/invoices/
  invoices.module.ts, invoices.controller.ts, invoices.service.ts  ← createForSubscription() exported; invoice numbering
  entities/invoice.entity.ts
  dto/mark-paid.dto.ts

src/vat/
  vat.module.ts, vat.controller.ts, vat.service.ts  ← computeTax() exported; summaries + org rollup
  entities/vat-period-summary.entity.ts
  dto/generate-vat-summary.dto.ts

src/schedule/
  schedule.module.ts, schedule.controller.ts, schedule.service.ts  ← materialize() + horizonCron (2:00 daily)
  rrule.util.ts  ← expandRrule() (validates DTSTART presence); rrule.util.spec.ts
  entities/slot-template.entity.ts (+ duration_minutes), slot.entity.ts (+ booking_window_hours, cancellation_cutoff_hours)
  dto/create-template.dto.ts, update-template.dto.ts, generate-slots.dto.ts,
      create-slot.dto.ts, update-slot.dto.ts

src/bookings/
  bookings.module.ts
  bookings.controller.ts  ← BookingsController (/bookings) + CheckinController (/checkin) + EntryQrController (/members/me/entry-qr)
  bookings.service.ts     ← gates, atomic capacity claim, waitlist promotion, QR sign/verify
  entities/booking.entity.ts
  dto/create-booking.dto.ts, checkin.dto.ts

src/reports/
  reports.module.ts, reports.controller.ts
  reports.service.ts  ← computeMetrics() (5 grouped queries, shared by both endpoints + the digest cron), sendDailyDigests() cron (23:55 daily)

src/common/utils/gym-scope.ts  ← scopedGymIds() / assertGymAccess() — shared staff gym-scoping helpers

src/main.ts   ← global ValidationPipe, setGlobalPrefix('api/v1'), rawBody:true (Stripe webhook)
seed.js       ← creates super_admin + org + gym + org_admin; run with node seed.js
```

## 7. Pending Modules

- [x] OrganizationModule — complete
- [x] GymModule — complete
- [x] StaffModule — expanded: list, profile, update, gym access grant/revoke
- [x] MembersModule — expanded: list, self-profile, staff profile view, self-update, status management
- [x] PlansModule — MembershipPlan and Discount CRUD (soft archive/deactivate)
- [x] SubscriptionsModule — staff-led create + first invoice, renew, pause/resume/cancel, past_due cron
- [x] InvoicesModule — auto-generated, manual pay/refund/resend, vat_number + invoice_number snapshotted
- [x] VatModule — computeTax(), VatPeriodSummary generation + filing; org rollup is a live query
- [x] ClassScheduleModule — RRULE templates, slot materialization + cron, occurrence-level edits, disable/enable with notifications, member browse
- [x] BookingsModule — booking gates, waitlist + promotion, class QR check-in, gym-door entry QR, no-show, staff roster
- [x] CommunicationModule + NotificationsModule — every member email paired with push (Firebase) + in-app inbox row, automated booking-reminder cron, staff announcement broadcast, device-token registration
- [x] ReportsModule — live per-gym + org-rollup statistics endpoints, daily digest email to org_admin; no AI/LLM (deferred from spec)

## 8. Key Architectural Decisions

**Platform billing is a separate layer from member billing**
`PlatformBillingModule` handles the org → super_admin money flow (SaaS subscription). The reserved `PlansModule` / `SubscriptionsModule` / `InvoicesModule` remain member → gym billing and share nothing with it. `PlatformPlan` ≠ `MembershipPlan`; `OrgSubscription` ≠ `MemberSubscription`.

**Stripe Checkout + webhooks, auto-renewing**
Orgs pay on a Stripe-hosted Checkout page (mode: subscription, quantity = branch count). The webhook (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated/deleted`) is the source of truth for status transitions. Stripe SDK v22: `current_period_end` is read from subscription items with a fallback (`periodEnd()` helper), and `invoice.subscription` via `invoiceSubId()` helper.

**Subscription lock is an interceptor, not a guard**
Global guards run before route-level JWT guards (so `request.user` wouldn't exist yet). `SubscriptionInterceptor` is registered as a global `APP_INTERCEPTOR` and runs after guards: org staff of a non-`active`/`grace` org get 403 on everything except routes tagged `@SkipSubscriptionCheck()` (auth + platform billing). Members and super_admin pass untouched. `Organization.subscription_status` is a denormalized copy of the live `OrgSubscription.status` for this per-request check.

**Grace period: 3 days, daily reminders**
`invoice.payment_failed` → status `grace`, `grace_ends_at = +3 days`, access retained. Daily 9:00 cron (`graceCron`) emails every org_admin a countdown reminder, expires subs whose grace lapsed (locks dashboard), and safety-nets lapsed `active` subs whose webhook was missed.

**Branch-count pricing via Stripe quantity**
One Stripe Price per plan; checkout quantity = branches paid for. `GymService.create` blocks creating more gyms than `OrgSubscription.branch_count` (orgs without a sub row — e.g. seeded — are not limited). `POST /platform/billing/quantity` updates the Stripe subscription with proration.

**Org branding ships in the login response**
`POST /auth/staff/login`, `POST /auth/member/login` and both invite-accept endpoints return `organization: { id, name, logo_url, branding, ... }` alongside `access_token`, so the app can theme itself before making any authenticated call. Staff orgs resolve via `organization_id` (null for super_admin → `organization: null`); members resolve via their `primary_gym_id` → gym → organization. `branding.primary_color` / `branding.secondary_color` / `branding.accent` / `branding.logo_url` are **guaranteed present** — platform defaults (`#111827` / `#6B7280` / `#F59E0B` / null) fill anything the org hasn't customized. All three colors are validated hex, top-level fields on `PATCH /organizations/:id` (stored inside `branding`, same pattern as `accent`).

**Branch visibility in `organization` is role-scoped, not just present/absent**
The `organization` object carries **one of two mutually-exclusive keys**, decided in `AuthService.brandingShape()` — never both: `org_admin` (and `super_admin`, though `super_admin` never reaches this since `organization` is `null` for them) gets `gyms: { id, name, type }[]` — every branch in the org, because org-wide admin needs the whole roster. Every other role — `gym_manager`, `front_desk`, and every member — gets `branch: { id, name, type }[]` instead, filtered down to only the gym(s) that role is actually affiliated with (`StaffJwtPayload.gym_ids` / `MemberJwtPayload.gym_ids`); staffed/affiliated with more than one branch returns all of them, not just one. Same rule applies to `GET /organizations/:id` (`OrganizationService.findOne()`) — `org_admin`/`super_admin` get the full `gyms` relation, `gym_manager`/`front_desk` get a `branch` array instead, which is also why that endpoint's `@Roles` was widened from `org_admin`-only to include `gym_manager`/`front_desk` (the existing `user.org_id !== id` check already prevented cross-org access, so widening the roles doesn't loosen tenant isolation — it only lets more of *your own* org's staff read it). Both entries are the same lean `{ id, name, type }` projection, not the full `Gym` row.

**Org branding is a jsonb blob**
`Organization.branding` (jsonb) holds the org's app theme (colors, fonts, sizes). Updated through the existing `PATCH /organizations/:id`; the frontend owns the shape. Updates **merge** into the existing blob. `accent` is a top-level DTO field (hex-validated) stored as `branding.accent`. The same endpoint accepts multipart/form-data with a `logo` image file (≤2 MB) uploaded to **Cloudinary** (`gym-saas/org-logos` folder) and saved as `logo_url` — env vars `CLOUDINARY_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`. On multipart requests `branding` arrives as a JSON string and is parsed by a `@Transform` in the DTO.

**Junction tables for gym access**
Staff and Members have no direct FK to Gym. Access is always through `StaffGymAccess` and `MemberGymAccess`. One staff/member can belong to multiple branches; each row has its own lifecycle (granted → revoked).

**gym_ids baked into JWT at login**
Active junction rows are queried once at login and embedded in the token. No extra DB call per request. Token must be re-issued when gym access changes.

**Member invite mirrors staff invite**
Both use a 64-hex-char random token stored on the user row (`invite_token`, `invite_expires_at`). A placeholder bcrypt hash is set at invite time; the real hash is set on accept. Invite expires in 72 hours.

**OTP-based password reset and change**
Both staff and members use a 6-digit numeric OTP (stored in `reset_token`, expires in 10 min via `reset_token_expires_at`). Forgot-password is silent on unknown emails. Reset verifies `email + otp` together. Change-password requires authentication first — a separate `send-otp` endpoint dispatches the OTP, then `change-password` verifies it. Same `reset_token` column is reused for both flows.

**Waiver per member+gym**
`Waiver` has a `@Unique(['member_id', 'gym_id'])` constraint — one signed waiver per gym. IP is captured server-side from `req.ip` / `x-forwarded-for`. `signed_at` is set to `new Date()` in the service.

**super_admin has null org_id**
`staff_users.organization_id` is nullable. `super_admin` rows have `NULL` there. `StaffJwtPayload.org_id` is typed `string | null`. Any org-scoped endpoint must guard against null org_id explicitly (see `staff.controller.ts` example).

**RolesGuard super_admin bypass**
`if (user.role === StaffRole.SUPER_ADMIN) return true` runs before the `required.includes(user.role)` check. Super admin passes every `@Roles(...)` decorator automatically.

**synchronize off in production**
`TypeOrmModule` sets `synchronize: config.get('NODE_ENV') !== 'production'`. Run migrations explicitly in production.

**Member billing is manual (v1)**
No payment processor for members yet — front desk collects cash/card in person. Creating a subscription auto-generates a `pending` invoice; `PATCH /invoices/:id/pay` (or `mark_paid: true` at creation) records the money. Renewals are explicit (`POST /subscriptions/:id/renew`); a daily 8:00 cron flags lapsed recurring subs `past_due` (payg/class_pack never recur — they get 1-year validity), and paying a past_due sub's invoice re-activates it. Discounts are first-invoice-only promo codes (usage-counted, expiry-checked); renewals charge full price. Plans archive, discounts deactivate — never hard-delete (FK references). Tax math is centralized in `VatService.computeTax()`: rate = plan `vat_rate_override` → gym `default_tax_rate`, zero when VAT-exempt or `tax_mode = none`; `tax_inclusive` gyms derive net from gross. `stripe_*` / `gocardless_*` columns are reserved for future online billing. One ongoing subscription per member per gym.

**Class schedule: templates materialize real slot rows**
`SlotTemplate.rrule` is a full RFC 5545 string (must include `DTSTART`, UTC) expanded with the `rrule` package. Slots are materialized ahead of time — on template create, via `POST /schedule/templates/:id/generate`, and by a daily 2:00 cron keeping a 30-day rolling horizon — never computed per request. Generation is idempotent (skips existing `starts_at` per template) and skips instructor-overlap occurrences. Each Slot snapshots capacity/instructor/`booking_window_hours`/`cancellation_cutoff_hours` from the template so single occurrences are editable independently ("this occurrence only") and one-off slots work identically; `apply_to_future: true` on a template PATCH propagates instead (timing changes delete+regenerate future *empty* slots, booked ones are kept). Capacity can never drop below `booking_count` (409). Disable ≠ delete: disable keeps bookings and emails affected members; hard delete only with zero bookings. Members never see disabled slots; `GET /schedule/slots/browse` annotates each slot with `spots_remaining`, `is_full`, `booking_opens_at`, `cancellation_cutoff_at`, `booking_open` — enforcement lands in BookingsModule, which will also own `booking_count` increments.

**Bookings: subscription-gated, two QR codes, derived credits**
Booking requires an active `MemberSubscription` at the slot's gym (the manual-billing collection lever: `past_due`/`paused` block booking). Capacity is claimed with one atomic `UPDATE … WHERE booking_count < capacity` (race-safe); full classes waitlist, and a confirmed cancellation promotes the lowest `waitlist_position` (QR issued + email, `booking_count` unchanged). `booking_count` counts confirmed only, and BookingsModule owns all its mutations. Class-pack/PAYG credits are derived — count of non-cancelled bookings at the gym in the current period vs `included_credits` — so in-time cancellation refunds automatically. Two signed-JWT QRs with distinct `typ` claims: the **class QR** (`booking_id + member_id + slot_id`, expires at slot end, issued on confirm/promotion) and the **gym-door entry QR** (`member_id + gym_id`, fetched on demand at `GET /members/me/entry-qr`, never stored, expires at `current_period_end`; the scan does one live DB check so pause/cancel revokes mid-period). Scan endpoints return `200 { allowed, reason }` for scanner UX instead of HTTP errors. Member cancel respects the slot's `cancellation_cutoff_hours`; `staff-cancel` overrides it. No unique (slot, member) constraint — cancelled rows must not block rebooking; a pre-query blocks duplicates.

**Notifications: one dispatcher, two channels, one inbox row per event**
`NotificationsService.notify()` is the single place every member-facing event goes through: waitlist promotion, slot disabled, invoice ready (auto-created and on manual resend), pre-class booking reminders, and staff-composed announcements. It looks the member up itself (callers only ever pass a `member_id`), attempts email (via `MailService`) and push (via `FirebaseService`/FCM) **independently** — one channel failing never blocks the other or the log write — and writes exactly **one** `NotificationLog` row per event (not per channel), which doubles as both the member's in-app notification feed and the delivery audit trail (`email_status`/`push_status` on the same row, so the inbox never shows duplicate entries for one event). `InvoicesService.resend()` is the one exception: it calls `MailService` directly so a failed resend still throws and tells staff (`notify()`'s contract is best-effort, the opposite of what an explicit "resend" needs), then logs the push+inbox side via `logInvoiceResent()` once the email is confirmed sent.

**Push is optional infrastructure, not a hard dependency**
`FirebaseService` boots off `FIREBASE_SERVICE_ACCOUNT_PATH` (falls back to a dev/testing key at `src/common/utils/*firebase-adminsdk*.json`, gitignored — real secret, never committed). If the file is missing, push is silently disabled at boot (logged once) and every `notify()` call still succeeds via email + the in-app log; nothing crashes. A `messaging/registration-token-not-registered` response clears the dead `Member.fcm_token` so a stale token stops being retried forever.

**Automated booking reminders — the previously-missing MVP feature**
A 15-minute cron (`NotificationsService.sendBookingReminders`) finds confirmed bookings whose slot starts within 2 hours and haven't been reminded yet (`Booking.reminder_sent_at IS NULL`, owned by NotificationsModule the same way BookingsModule owns `booking_count`), fires email+push+log per booking, and stamps `reminder_sent_at` so it's never sent twice — condition-based catch-up (like the existing past-due/grace crons), not a narrow time-window match, so a missed tick still catches up on the next run.

**Announcements reuse the same dispatcher as system events**
`POST /communication/broadcast` (org_admin/gym_manager) targets every active member of a gym, or a picked subset via `member_ids`, and fans out through the exact same `notify()` call each system-triggered event uses — so a manual "gym closed for maintenance" announcement gets the identical email+push+inbox treatment as an automatic waitlist promotion.

**Reports: live queries only, no stored snapshots, no AI**
`ReportsModule` replaced the original `AiReport`/`OrgReport` entity stubs (Gemini-summarized daily/monthly reports, never implemented, deleted along with their `Gym`/`Organization` relations) with pure statistics — same "live query, not a stored record" precedent `VatService.orgRollup()` already set. `ReportsService.computeMetrics(gyms, start, end)` is the one aggregation function behind both `GET /reports/gyms/:gymId/stats` and `GET /reports/org/stats` (org rollup sums the per-gym numbers and **recomputes rates from the summed counts**, never averages per-gym rates) — 5 grouped SQL queries (`GROUP BY gym_id`, Postgres `FILTER (WHERE …)` for sub-breakdowns) regardless of how many gyms are asked for. Bookings/attendance/fill-rate are windowed on the **slot's** `starts_at` (classes that happened in the period), not booking `created_at`. Churn rate (`cancelled_in_period / (active_now + cancelled_in_period)`) is a documented approximation — there's no historical subscriber-count snapshot to divide against instead. `MemberSubscription` gained an `@UpdateDateColumn() updated_at` (previously absent) so "cancelled today" is queryable — a bare `sub.status = CANCELLED; save()` in `SubscriptionsService.cancel()` now bumps it for free.

**Daily digest email bypasses NotificationsService on purpose**
`ReportsService.sendDailyDigests()` (23:55 daily) emails every active org_admin an end-of-day summary. It calls `MailService.sendDailyDigest()` directly instead of going through `NotificationsService.notify()` — `notify()` is member-scoped (loads a `Member`, writes to the member-only `NotificationLog` inbox), and an org_admin is a `StaffUser` with no in-app inbox anywhere in this system. Same narrow "call MailService directly" exception `InvoicesService.resend()` already established, for a different reason (recipient isn't a member at all, not "must throw on failure").

## 9. JWT Payload Shapes

### StaffJwtPayload
```typescript
{
  sub: string;           // StaffUser.id
  email: string;
  role: StaffRole;       // 'super_admin' | 'org_admin' | 'gym_manager' | 'front_desk'
  org_id: string | null; // null for super_admin
  gym_ids: string[];     // active StaffGymAccess rows (empty for super_admin / org_admin)
}
```

### MemberJwtPayload
```typescript
{
  sub: string;            // Member.id
  email: string;
  gym_ids: string[];      // active MemberGymAccess rows
  primary_gym_id: string; // row where is_primary = true
  status: MemberStatus;   // 'active' | 'paused' | 'expired' | 'cancelled'
}
```

Source of truth: `src/common/interfaces/jwt-payload.interface.ts`

## 10. Seed Accounts (dev only)

| Role | Email | Password |
|---|---|---|
| super_admin | super@platform.com | Super1234! |
| org_admin | owner@test.com | Test1234! |

Gym ID: `2e82ea95-3c50-48bf-93a1-251b7b807cd3`
Org ID: `6c6ec47d-939c-4a64-aff6-52a3efe7a877`

Re-run with `node seed.js` on a fresh DB. The seed org is created with `subscription_status = 'active'` so the dev org_admin isn't locked out by the SubscriptionInterceptor. On an **existing** DB (column added by synchronize with default `'pending'`), unlock it once with:
`UPDATE organizations SET subscription_status = 'active';`

## 11. Environment Variables

| Variable | Purpose |
|---|---|
| `DB_HOST` | Postgres host |
| `DB_PORT` | Postgres port |
| `DB_USER` | Postgres user |
| `DB_PASSWORD` | Postgres password |
| `DB_NAME` | Database name |
| `JWT_SECRET` | HS256 signing secret for all tokens |
| `JWT_EXPIRES_IN` | Token TTL (default: `7d`) |
| `NODE_ENV` | `production` disables TypeORM synchronize |
| `FRONTEND_URL` | Base URL for invite email links (default: `http://localhost:3001`) |
| `EMAIL_USER` | Gmail address for Nodemailer |
| `EMAIL_PASS` | Gmail app password |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_…` in dev) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_…`, from `stripe listen` in dev) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to the Firebase Admin SDK service account JSON (push notifications). Falls back to a gitignored dev/testing key in `src/common/utils/`; if neither exists, push is silently disabled and email + in-app notifications still work |
