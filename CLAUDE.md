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
| `NotificationsModule` | The full member communication layer: pairs every member-facing email with push (mobile via Firebase, browser via `web-push`/VAPID) and an in-app inbox row, automated pre-class booking reminders (cron), staff announcement broadcast, member notification inbox + device-token/web-push-subscription registration, manual test-push endpoint |
| `ReportsModule` | Live statistics for staff dashboards: revenue, bookings, attendance, no-shows, fill rate, churn — per gym and org-wide rollup. End-of-day digest email to every org_admin. No AI/LLM — pure SQL aggregation |
| `PlatformBillingModule` | **Platform-level billing**: orgs pay the super_admin via Stripe. Platform plans (monthly/quarterly/yearly, priced per branch), checkout, webhooks, payment-method CRUD, grace-period cron, subscription lock (SubscriptionInterceptor) |
| `HelpModule` | Static Help & Legal content for the member app: FAQs, privacy policy, terms of service, membership terms, contact support. Public, no DB table — hardcoded placeholder copy pending real legal text |

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
- [x] **BookingsModule** — member booking with layered gates (active member + gym access + active subscription at the gym + booking window + credits), atomic capacity claim, waitlist with auto-promotion + email, member/staff cancel (cutoff vs override), no-show marking, class check-in QR (expires with the slot) and gym-door entry QR (expires with the subscription period, live-revoked on pause/cancel), scanner-friendly `POST /checkin/*` endpoints. Owns all `Slot.booking_count` mutations. Also owns the printable per-gym desk entry QR and gym-attendance tracking (`Attendance`, one row per member/gym/day) — the same `markAttendanceOnce()` write path is shared by the existing staff-scanned personal entry QR and the new member-scanned desk QR, so attendance reflects a gym visit regardless of which method was used. See `BOOKINGS_MODULE_OVERVIEW.md` + `BOOKINGS_POSTMAN_ENDPOINTS.md`, and `ATTENDANCE_MODULE_OVERVIEW.md` + `ATTENDANCE_POSTMAN_ENDPOINTS.md` for the desk QR / attendance half, and `CHECKIN_STATUS_OVERVIEW.md` + `CHECKIN_STATUS_POSTMAN_ENDPOINTS.md` for the today/last-check-in read endpoint.
- [x] **CommunicationModule + NotificationsModule** — every member-facing event (waitlist promotion, slot disabled, invoice ready, pre-class reminder, staff announcement, booking confirmed/waitlisted/cancelled-by-staff, subscription paused/resumed/past_due) fires through one dispatcher that sends email (Nodemailer) + push (mobile via Firebase Cloud Messaging, browser via `web-push`/VAPID — both independently best-effort) + writes one `NotificationLog` row. Automated booking reminders (15-min cron, 2h lead time) is the previously-missing MVP feature from the feature spec. Member notification inbox (list/unread-count/mark-read/mark-all-read) + device-token registration (`POST/DELETE /notifications/device-token`) + web-push-subscription registration (`POST/DELETE /notifications/web-push-subscription`) + manual test-push (`POST /notifications/test-push`, fires a canned notification through every channel the member has registered, doesn't touch the inbox). Staff announcement broadcast (`POST /communication/broadcast`) to a gym's members (all or a picked list). Owns `Booking.reminder_sent_at`. See `COMMUNICATION_MODULE_OVERVIEW.md` + `COMMUNICATION_POSTMAN_ENDPOINTS.md` for the original email+FCM design, and `WEB_PUSH_OVERVIEW.md` + `WEB_PUSH_POSTMAN_ENDPOINTS.md` for the web-push channel + the new booking/subscription triggers.
- [x] **ReportsModule** — live per-gym stats (`GET /reports/gyms/:gymId/stats`) and org-wide rollup + per-gym breakdown (`GET /reports/org/stats`): revenue (+ payment-method split), bookings (class check-ins), gym check-ins (`Attendance`, distinct from class check-ins), fill-rate, no-show rate, new members, churn rate — all `?period_start=&period_end=`, computed on request, nothing stored. Daily 23:55 cron emails every active org_admin an end-of-day digest (today's revenue, bookings, class check-ins, gym check-ins, new members, cancelled subscriptions) via `MailService.sendDailyDigest()` directly (org_admin is staff, not a member — bypasses `NotificationsService`). No AI/LLM summarization — deliberately deferred from the feature spec's "AI daily report." See `REPORTS_MODULE_OVERVIEW.md` + `REPORTS_POSTMAN_ENDPOINTS.md`.
- [x] **HelpModule** — Help & Legal content for the member app: `GET /help/faqs`, `GET /help/privacy-policy`, `GET /help/terms`, `GET /help/membership-terms`, `GET /help/contact-support`. Public, unguarded, hardcoded placeholder copy (no DB table) — real legal text to be swapped in later. See `HELP_MODULE_POSTMAN_ENDPOINTS.md`.

### Active Endpoints

All routes are prefixed with `/api/v1`. Base URL in dev: `http://localhost:3000/api/v1`.

| Method | Path | Guard | Who |
|---|---|---|---|
| POST | `/auth/staff/login` | Public | Any staff — returns `access_token` + `organization` branding block (null for super_admin) |
| POST | `/auth/member/login` | Public | Any member — returns `access_token` + `member_id` + `organization` branding block (via primary gym) |
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
| GET | `/members/profile` | MemberJwt | Member views own profile + active gym access |
| GET | `/members/:id` | StaffJwt | Staff views member profile + full gym access history |
| PATCH | `/members/profile` | MemberJwt | Member updates own full_name / phone / photo_url; accepts JSON or multipart/form-data with a `photo` image file (≤2 MB, uploaded to Cloudinary) |
| DELETE | `/members/profile` | MemberJwt | Member self-deletes own account (soft delete) — cancels open subscriptions, revokes gym access, blocks future login; invoices/bookings/attendance history untouched |
| PATCH | `/members/:id/status` | StaffJwt + Roles(org_admin, gym_manager) | Pause (with dates) / cancel / reactivate member; rejects `status: deleted` (member-initiated only) |
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
| GET | `/subscriptions/me` | MemberJwt | Member's own subscriptions + plan, plus derived `total_days`/`check_ins`/`days_left` (frozen while paused, zeroed once past_due/cancelled) |
| GET | `/subscriptions/:id` | StaffJwt | Detail with plan/member/discount/invoices |
| POST | `/subscriptions/:id/renew` | StaffJwt + Roles(org_admin, gym_manager, front_desk) | Advance period + next invoice (full price, no promo) |
| PATCH | `/subscriptions/:id/pause` | StaffJwt + Roles(org_admin, gym_manager) | active → paused; response includes derived `total_days`/`days_left`/`check_ins` |
| PATCH | `/subscriptions/:id/resume` | StaffJwt + Roles(org_admin, gym_manager) | paused → active; shifts `current_period_end` forward by days spent paused; response includes derived `total_days`/`days_left`/`check_ins` |
| PATCH | `/subscriptions/me/:id/pause` | MemberJwt | Member pauses own subscription (must own it); active → paused; response includes derived `total_days`/`days_left`/`check_ins` |
| PATCH | `/subscriptions/me/:id/resume` | MemberJwt | Member resumes own subscription; paused → active; same date-shift as staff resume; response includes derived `total_days`/`days_left`/`check_ins` |
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
| PATCH | `/schedule/templates/:id` | StaffJwt + Roles(org_admin, gym_manager) | Update; `apply_to_future: true` propagates to future slots (timing changes regenerate empty slots, booked ones kept); `generate_until?` extends the materialized window in the same call (idempotent, max 366 days; response reports new `generated_until`) — replaces the old standalone `/generate` endpoint |
| DELETE | `/schedule/templates/:id` | StaffJwt + Roles(org_admin, gym_manager) | Deactivate (soft); removes future empty slots, keeps booked |
| POST | `/schedule/slots` | StaffJwt + Roles(org_admin, gym_manager) | One-off custom slot; 409 on instructor overlap |
| GET | `/schedule/slots` | StaffJwt | Calendar (scoped); `?gym_id=&from=&to=&status=&template_id=&month=` (default today → +30d); `month=YYYY-MM` pages by calendar month and overrides `from`/`to` |
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
| GET | `/members/me/entry-qr` | MemberJwt | Gym-door entry QR — `{ qr_token, qr_image, gym_id, valid_until }`, `qr_image` a base64 PNG data URI; 403 without active subscription; `?gym_id=` |
| GET | `/members/profile/checkin-status` | MemberJwt | Today's check-in status + last check-in — `{ gym_id, checked_in_today, checked_in_at, last_check_in: { date, checked_in_at, days_ago, label } \| null }`, `label` is `"today"`/`"yesterday"`/`"N days ago"`; 403 if `gym_id` isn't an affiliated gym; `?gym_id=` (defaults to `primary_gym_id`) |
| POST | `/checkin/entry` | StaffJwt | Scan entry QR → `{ allowed, reason?, member, subscription? }` (live sub check) |
| POST | `/checkin/booking` | StaffJwt | Scan class QR → marks checked_in; `{ allowed, reason?, member, class }` |
| GET | `/gyms/:id/qr` | StaffJwt + Roles(org_admin, gym_manager) | Printable static desk QR for the gym — `{ gym_id, gym_name, qr_token, qr_image }`, non-expiring in practice (10-year token) |
| POST | `/checkin/gym-scan` | MemberJwt | Member scans the gym's printed desk QR themselves → `{ allowed, reason?, gym?, subscription?, already_checked_in_today? }`; marks daily attendance (shared with `/checkin/entry`) |
| GET | `/notifications` | MemberJwt | Own notification feed (email+push events); `?unread_only=true`; each row carries `gym_name`/`gym_icon_url` (joined live from `gym.organization.logo_url`, not stored) |
| GET | `/notifications/unread-count` | MemberJwt | `{ unread_count }` |
| PATCH | `/notifications/:id/read` | MemberJwt | Mark one notification read; response also carries `gym_name`/`gym_icon_url` |
| PATCH | `/notifications/read-all` | MemberJwt | Mark every unread notification read |
| POST | `/notifications/device-token` | MemberJwt | `{ fcm_token }` — register this device for mobile push (Firebase) |
| DELETE | `/notifications/device-token` | MemberJwt | Clear the device token (e.g. on logout) |
| POST | `/notifications/web-push-subscription` | MemberJwt | `{ endpoint, keys: { p256dh, auth } }` — register this browser for web push (the raw `PushSubscription.toJSON()` output) |
| DELETE | `/notifications/web-push-subscription` | MemberJwt | Clear the browser subscription (e.g. on logout) |
| POST | `/notifications/test-push` | MemberJwt | `{ title?, body?, gym_id? }` — fires a canned notification through every channel (FCM + web push) the member has registered; 404 if none registered; 403 if `gym_id` isn't one of the member's affiliated gyms; passing `gym_id` also exercises gym-branded icon/badge and echoes `gym_name`/`gym_icon_url` back in the response; doesn't write to the in-app inbox |
| POST | `/communication/broadcast` | StaffJwt + Roles(org_admin, gym_manager) | `{ gym_id, member_ids?, title, body }` — announcement to a gym's members (all, or a picked list); email + push + inbox |
| GET | `/reports/gyms/:gymId/stats` | StaffJwt + Roles(org_admin, gym_manager) | Live per-gym stats; `?period_start=&period_end=` (required, `period_end` exclusive) |
| GET | `/reports/org/stats` | StaffJwt + Roles(org_admin) | Live org-wide rollup + per-gym breakdown; `?period_start=&period_end=`; super_admin gets 400 (use per-gym instead) |
| GET | `/help/faqs` | Public | List of `{ id, question, answer }` — hardcoded placeholder content |
| GET | `/help/privacy-policy` | Public | `{ title, updated_at, content }` — hardcoded placeholder content |
| GET | `/help/terms` | Public | `{ title, updated_at, content }` — hardcoded placeholder content |
| GET | `/help/membership-terms` | Public | `{ title, updated_at, content }` — hardcoded placeholder content (billing/pause/cancel/refund policy, distinct from general ToS) |
| GET | `/help/contact-support` | Public | `{ email, phone, hours, address }` — hardcoded placeholder content |

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
  notifications.service.ts     ← notify()/logDelivered()/dispatchPush() dispatch, typed triggers, booking-reminder cron (*/15 * * * *), broadcastAnnouncement(), sendTestPush()
  firebase.service.ts          ← FCM wrapper (mobile push); boots best-effort off FIREBASE_SERVICE_ACCOUNT_PATH, push silently disabled if unset/missing
  web-push.service.ts          ← `web-push`/VAPID wrapper (browser push); boots best-effort off VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT, silently disabled if unset
  dto/register-device-token.dto.ts, register-web-push-subscription.dto.ts, test-push.dto.ts, broadcast.dto.ts

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
  subscription-progress.util.ts  ← pure total_days/days_left/check_ins-window math, unit-tested
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
  dto/create-template.dto.ts, update-template.dto.ts,
      create-slot.dto.ts, update-slot.dto.ts

src/bookings/
  bookings.module.ts
  bookings.controller.ts  ← BookingsController (/bookings) + CheckinController (/checkin) + EntryQrController (/members/me/entry-qr, /members/profile/checkin-status) + GymQrController (/gyms/:id/qr)
  bookings.service.ts     ← gates, atomic capacity claim, waitlist promotion, QR sign/verify, markAttendanceOnce()
  entities/booking.entity.ts, attendance.entity.ts
  dto/create-booking.dto.ts, checkin.dto.ts

src/reports/
  reports.module.ts, reports.controller.ts
  reports.service.ts  ← computeMetrics() (5 grouped queries, shared by both endpoints + the digest cron), sendDailyDigests() cron (23:55 daily)

src/help/
  help.module.ts, help.controller.ts
  help.service.ts  ← FAQS/PRIVACY_POLICY/TERMS constants — no entity, no DB table

src/common/utils/gym-scope.ts  ← scopedGymIds() / assertGymAccess() — shared staff gym-scoping helpers

src/main.ts   ← global ValidationPipe, setGlobalPrefix('api/v1'), rawBody:true (Stripe webhook),
    pg DATE (OID 1082) type-parser override — `date` columns round-trip as raw
    'YYYY-MM-DD' strings instead of a local-timezone Date object
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
- [x] CommunicationModule + NotificationsModule — every member email paired with push (Firebase mobile + web-push/VAPID browser) + in-app inbox row, automated booking-reminder cron, staff announcement broadcast, device-token/web-push-subscription registration, manual test-push
- [x] ReportsModule — live per-gym + org-rollup statistics endpoints, daily digest email to org_admin; no AI/LLM (deferred from spec)
- [x] HelpModule — static FAQs/privacy-policy/terms/membership-terms/contact-support endpoints, hardcoded placeholder content

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

**Member login responses carry `member_id`**
`POST /auth/member/login` and `POST /auth/member/invite/accept` both return `member_id` (the same value as the JWT's `sub` claim) alongside `access_token` and `organization`, so the app has the member's own ID without needing to decode the token. Staff login intentionally doesn't carry an equivalent top-level `staff_id` — not asked for, add it the same way if it comes up.

**Branch visibility in `organization` is role-scoped, not just present/absent**
The `organization` object carries **one of two mutually-exclusive keys**, decided in `AuthService.brandingShape()` — never both: `org_admin` (and `super_admin`, though `super_admin` never reaches this since `organization` is `null` for them) gets `gyms: { id, name, type }[]` — every branch in the org, because org-wide admin needs the whole roster. Every other role — `gym_manager`, `front_desk`, and every member — gets `branch: { id, name, type }[]` instead, filtered down to only the gym(s) that role is actually affiliated with (`StaffJwtPayload.gym_ids` / `MemberJwtPayload.gym_ids`); staffed/affiliated with more than one branch returns all of them, not just one. Same rule applies to `GET /organizations/:id` (`OrganizationService.findOne()`) — `org_admin`/`super_admin` get the full `gyms` relation, `gym_manager`/`front_desk` get a `branch` array instead, which is also why that endpoint's `@Roles` was widened from `org_admin`-only to include `gym_manager`/`front_desk` (the existing `user.org_id !== id` check already prevented cross-org access, so widening the roles doesn't loosen tenant isolation — it only lets more of *your own* org's staff read it). Both entries are the same lean `{ id, name, type }` projection, not the full `Gym` row.

**Org branding is a jsonb blob**
`Organization.branding` (jsonb) holds the org's app theme (colors, fonts, sizes). Updated through the existing `PATCH /organizations/:id`; the frontend owns the shape. Updates **merge** into the existing blob. `accent` is a top-level DTO field (hex-validated) stored as `branding.accent`. The same endpoint accepts multipart/form-data with a `logo` image file (≤2 MB) uploaded to **Cloudinary** (`gym-saas/org-logos` folder) and saved as `logo_url` — env vars `CLOUDINARY_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`. On multipart requests `branding` arrives as a JSON string and is parsed by a `@Transform` in the DTO.

**Member profile photo mirrors org logo upload**
`PATCH /members/profile` (renamed from `/members/me`, matching `GET /members/profile` — the entry-QR route `GET /members/me/entry-qr` is unrelated and unchanged) follows the same multipart pattern as `PATCH /organizations/:id`: an optional `photo` image file (≤2 MB) uploads to Cloudinary (`gym-saas/member-photos` folder) and overwrites `Member.photo_url`; JSON-only requests can still set `photo_url` directly.

**Account deletion is a soft delete, member-initiated only**
`DELETE /members/profile` (MemberJwt) is the only path to `MemberStatus.DELETED` — `PATCH /members/:id/status` (staff) explicitly rejects that value, since deletion carries side effects (cancelling subscriptions, revoking gym access) that a generic staff status flip shouldn't trigger implicitly. `MembersService.deleteAccount()` cancels every `active`/`paused`/`past_due` `MemberSubscription` (stops billing/renewal, same terminal state `SubscriptionsService.cancel()` produces) and revokes every active `MemberGymAccess` row (`is_active: false` + `revoked_at`, same fields `StaffGymAccess` revoke uses) — but never deletes or touches `Invoice`, `Booking`, `Waiver`, or `Attendance` rows, since those are financial/audit records that must survive the member who generated them. The `Member` row itself is never deleted either: `deleted_at` is stamped and `status` flips to `deleted`, blocking `POST /auth/member/login` (`Invalid credentials`, same response as a wrong password, so a deleted account isn't distinguishable from a nonexistent one) while leaving every historical FK reference intact. Re-registration under the same email is not supported — `POST /members/register`/`POST /members/invite` both reject on any existing row for that email regardless of status, deleted included, so a deleted account permanently retires that email address (matches how `discounts`/`plans` are deactivated, never freed for reuse, elsewhere in this codebase). No cron or async cleanup exists for deleted accounts — this is intentionally a one-shot state, not a data-retention pipeline.

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

**Subscription pause preserves remaining membership time**
`MemberSubscription.paused_at` is stamped on pause and read on resume: `resume()` computes whole days elapsed since `paused_at` and adds them onto `current_period_end`, so a pause never costs the member paid time (6 Aug–6 Sep, paused a week mid-period, resumed → new end date is 13 Sep). While paused, every benefit gate (`BookingsService.activeSubscription()`, entry-QR live check) requires `status === active`, not just an unexpired period, so a paused member gets zero class booking / gym-door access until they resume — no separate "block while paused" code needed, it falls out of the existing active-only checks. Staff (`PATCH /subscriptions/:id/pause|resume`, org_admin/gym_manager) and the member themself (`PATCH /subscriptions/me/:id/pause|resume`, ownership-checked against `member_id`) share the same `applyPause()`/`applyResume()` service logic — one pause/resume behavior regardless of who triggers it. No cooldown or max-pause-count — not asked for, add if abuse shows up. Both `applyPause()`/`applyResume()` return through the same `withProgress()` helper `findMine()` uses, so every pause/resume response (all four routes) carries the post-action `total_days`/`days_left`/`check_ins` — a caller never has to re-fetch `GET /subscriptions/me` just to see the numbers change after pausing.

**`date` columns are UTC-normalized, not server-local — two independent bugs, one root cause**
Postgres `date` columns (`MemberSubscription.current_period_start`/`current_period_end`) silently drifted a calendar day whenever the server's local timezone wasn't UTC (e.g. a Karachi, UTC+5, host), because two layers each defaulted to local time: (1) TypeORM's `DateUtils.mixedDateToDateString`, used to serialize a JS `Date` into a `date` column, reads `date.getFullYear()/getMonth()/getDate()` (local) unless the column is declared `{ type: 'date', utc: true }`; and (2) the `pg` driver's default OID-1082 parser (`postgres-date`) constructs the hydrated `Date` via `new Date(year, month, day)` — also local — regardless of that `utc` flag, which only controls TypeORM's *own* read-back conversion, not `pg`'s initial parse. Fixing only the first layer makes writes correct but reads wrong (a stored `2026-08-16` came back as `2026-08-15`, discovered by booting against a scratch DB with `verify` and diffing the API response against `SELECT current_period_start FROM member_subscriptions` directly — the two must be fixed together). The full fix: `main.ts` registers `types.setTypeParser(1082, (val) => val)` once at bootstrap so `pg` returns the raw `'YYYY-MM-DD'` string for every `date` column app-wide instead of a local-time `Date` (this makes `mixedDateToDateString`'s `utc` flag a no-op on read — a string isn't `instanceof Date`, so it passes through unchanged — and is behavior-neutral for every other `date` column in the schema, since their local-write/local-read pairing was already self-consistent, just on the wrong basis); `current_period_start`/`current_period_end` are declared `utc: true` so writes serialize on the UTC calendar day; and `SubscriptionsService` computes/shifts these dates with UTC arithmetic throughout (`startOfUtcDay()` floors `new Date()` before use as a period start in `create()`/`renew()`, `periodEnd()` uses `setUTCMonth`/`setUTCDate`/`setUTCFullYear`, `applyResume()` uses `setUTCDate` to shift `current_period_end` by the days paused) — matching the UTC basis `subscription-progress.util.ts`'s `toDate()` already assumed when parsing those columns back, and matching `Attendance.date` (written via `new Date().toISOString().slice(0, 10)` in `BookingsService.markAttendanceOnce()`), which was always UTC. Before the fix this showed up as two symptoms from the same mismatch: `days_left` briefly exceeding `total_days` (current_period_start serialized to a *later* local calendar day than the actual UTC instant, so "days remaining until period end" over-counted), and `check_ins` staying `0` despite a same-day check-in (the subscription's window boundary and `Attendance.date` disagreed by a day). Other `date` columns in the schema (`Discount.expires_at`, `Member.pause_start/pause_end`, `VatPeriodSummary.period_start/period_end`) are explicit, staff-picked dates rather than derived from "now" compared live against "now" — same latent local/UTC drift risk, not yet reported as broken, not touched here.

**Member billing is manual (v1)**
No payment processor for members yet — front desk collects cash/card in person. Creating a subscription auto-generates a `pending` invoice; `PATCH /invoices/:id/pay` (or `mark_paid: true` at creation) records the money. Renewals are explicit (`POST /subscriptions/:id/renew`); a daily 8:00 cron flags lapsed recurring subs `past_due` (payg/class_pack never recur — they get 1-year validity), and paying a past_due sub's invoice re-activates it. Discounts are first-invoice-only promo codes (usage-counted, expiry-checked); renewals charge full price. Plans archive, discounts deactivate — never hard-delete (FK references). Tax math is centralized in `VatService.computeTax()`: rate = plan `vat_rate_override` → gym `default_tax_rate`, zero when VAT-exempt or `tax_mode = none`; `tax_inclusive` gyms derive net from gross. `stripe_*` / `gocardless_*` columns are reserved for future online billing. One ongoing subscription per member per gym.

**Class schedule: templates materialize real slot rows**
`SlotTemplate.rrule` is a full RFC 5545 string (must include `DTSTART`, UTC) expanded with the `rrule` package. Slots are materialized ahead of time — on template create, via `generate_until` on `PATCH /schedule/templates/:id` (folded into the same endpoint as every other template edit, no standalone `/generate` route), and by a daily 2:00 cron keeping a 30-day rolling horizon — never computed per request. Generation is idempotent (skips existing `starts_at` per template) and skips instructor-overlap occurrences. Each Slot snapshots capacity/instructor/`booking_window_hours`/`cancellation_cutoff_hours` from the template so single occurrences are editable independently ("this occurrence only") and one-off slots work identically; `apply_to_future: true` on a template PATCH propagates instead (timing changes delete+regenerate future *empty* slots, booked ones are kept). Capacity can never drop below `booking_count` (409). `GET /schedule/slots?month=YYYY-MM` is the month-pagination path for staff calendar UIs — it replaces `from`/`to` with that calendar month's bounds (400 on a malformed value); `from`/`to` still work directly for arbitrary ranges. Disable ≠ delete: disable keeps bookings and emails affected members; hard delete only with zero bookings. Members never see disabled slots; `GET /schedule/slots/browse` annotates each slot with `spots_remaining`, `is_full`, `booking_opens_at`, `cancellation_cutoff_at`, `booking_open` — enforcement lands in BookingsModule, which will also own `booking_count` increments.

**Bookings: subscription-gated, two QR codes, derived credits**
Booking requires an active `MemberSubscription` at the slot's gym (the manual-billing collection lever: `past_due`/`paused` block booking). Capacity is claimed with one atomic `UPDATE … WHERE booking_count < capacity` (race-safe); full classes waitlist, and a confirmed cancellation promotes the lowest `waitlist_position` (QR issued + email, `booking_count` unchanged). `booking_count` counts confirmed only, and BookingsModule owns all its mutations. Class-pack/PAYG credits are derived — count of non-cancelled bookings at the gym in the current period vs `included_credits` — so in-time cancellation refunds automatically. Two signed-JWT QRs with distinct `typ` claims: the **class QR** (`booking_id + member_id + slot_id`, expires at slot end, issued on confirm/promotion) and the **gym-door entry QR** (`member_id + gym_id`, fetched on demand at `GET /members/me/entry-qr`, never stored, expires at `current_period_end`; the scan does one live DB check so pause/cancel revokes mid-period). Scan endpoints return `200 { allowed, reason }` for scanner UX instead of HTTP errors. Every response carrying a QR also carries a rendered `qr_image` (base64 PNG data URI, via the `qrcode` package) alongside the raw `qr_token` — `POST /bookings`, `GET /bookings/me`, and `GET /members/me/entry-qr` all render on the fly from the same token at request time, nothing stored as an image either. Because the underlying token is already regenerated per-request (entry QR) or already carries live-checked claims (class QR), and the scan itself re-checks the DB, a subscription change is reflected the next time the member's app fetches the QR — no separate image-invalidation step needed. Member cancel respects the slot's `cancellation_cutoff_hours`; `staff-cancel` overrides it. No unique (slot, member) constraint — cancelled rows must not block rebooking; a pre-query blocks duplicates.

**Notifications: one dispatcher, three channels, one inbox row per event**
`NotificationsService.notify()` is the single place every member-facing event goes through: waitlist promotion, slot disabled, invoice ready (auto-created and on manual resend), pre-class booking reminders, staff-composed announcements, booking confirmed/waitlisted/cancelled-by-staff, and subscription paused/resumed/past_due. It looks the member up itself (callers only ever pass a `member_id`), attempts email (via `MailService`) and push **independently** — one channel failing never blocks another or the log write — and writes exactly **one** `NotificationLog` row per event (not per channel), which doubles as both the member's in-app notification feed and the delivery audit trail (`email_status`/`push_status` on the same row, so the inbox never shows duplicate entries for one event). Push itself is two independent sub-channels behind one `push_status`: `dispatchPush()` (private helper, shared by `notify()` and `logDelivered()`) attempts mobile push via `FirebaseService`/FCM (if `Member.fcm_token` is set) and browser push via `WebPushService`/`web-push` (if `Member.web_push_subscription` is set) — `push_status` is `sent` if *either* delivered, `failed` if at least one was attempted and neither delivered, `skipped` if the member has no device registered on any channel. Six of the eleven current triggers (booking confirmed/waitlisted/cancelled-by-staff, subscription past_due/paused/resumed) have no `MailService` template yet, so they call `notify()` without an `email` callback — `email_status` reports `skipped` on those rows by design, not a bug; add a mail template + pass it in if an email leg is ever wanted there. `InvoicesService.resend()` is the one exception to the dispatcher entirely: it calls `MailService` directly so a failed resend still throws and tells staff (`notify()`'s contract is best-effort, the opposite of what an explicit "resend" needs), then logs the push+inbox side via `logInvoiceResent()` once the email is confirmed sent. See `WEB_PUSH_OVERVIEW.md` for the full trigger table and `WEB_PUSH_POSTMAN_ENDPOINTS.md` for the subscription-registration + manual test-push endpoints.

**Gym branding rides in the push payload, not in stored data**
Every push a member receives needs to show which gym it's from — there's no in-app UI open yet for the OS/browser notification tray to pull that from, so `notify()`/`logDelivered()` look up `gymBranding(gymId)` (gym name + `Organization.logo_url`, the only logo this schema has — gyms don't carry their own; every branch of a multi-branch org shows the org's shared logo until a per-gym logo field is asked for) and pass it to `dispatchPush()`, which forwards it into the actual provider payload: FCM gets `notification.imageUrl` (renders as the system-tray hero image), web push gets top-level `icon`/`badge` JSON fields (badge reuses the same logo — no separate monochrome badge asset exists) for the frontend service worker's `showNotification()` to read directly, and both also get `gym_name`/`gym_icon_url` folded into the `data` payload for apps that render their own notification UI. This is deliberately **not** also duplicated into the stored `NotificationLog.data` (the deep-link payload column) — a push payload is a one-shot, self-contained message to a possibly-offline device with no way to "join" anything at render time, so embedding branding there is the correct, standard use of those fields (a URL string, negligible against FCM/web-push's ~4KB payload caps). The in-app inbox has no such constraint: `GET /notifications` and `PATCH /notifications/:id/read` instead eager-load the existing `gym` → `gym.organization` relation and flatten it onto the response as `gym_name`/`gym_icon_url` (`NotificationsService.shapeNotification()`), so the logo is always current and never needs a backfill if an org's logo changes later.

**Push is optional infrastructure, not a hard dependency — on either channel**
`FirebaseService` (mobile) boots off `FIREBASE_SERVICE_ACCOUNT_PATH` (falls back to a dev/testing key at `src/common/utils/*firebase-adminsdk*.json`, gitignored — real secret, never committed). `WebPushService` (browser) boots off `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` — a keypair generated once via `npx web-push generate-vapid-keys` (see `WEB_PUSH_OVERVIEW.md` §4 for the full generate → configure → hand-to-frontend walkthrough, including why only the public key ever reaches the frontend). If either config is missing, that channel is silently disabled at boot (logged once) and every `notify()` call still succeeds via whatever channels remain; nothing crashes. Each channel self-heals on a dead registration: FCM's `messaging/registration-token-not-registered` clears `Member.fcm_token`, and a `404`/`410` from a browser vendor's push service (the subscription is confirmed dead) clears `Member.web_push_subscription` — both so a stale registration is never retried forever. `POST /notifications/test-push` (MemberJwt) exists to verify either/both channels are wired correctly without triggering a real event — it reuses `dispatchPush()` directly and deliberately skips writing a `NotificationLog` row, so it never pollutes the member's real in-app inbox. An optional `gym_id` (must be one of the member's affiliated gyms, else 403) also runs it through `gymBranding()` so the icon/badge path can be checked visually too, without waiting for a real triggered event; the response echoes `gym_name`/`gym_icon_url` back so what was sent is visible without needing to check the device.

**Automated booking reminders — the previously-missing MVP feature**
A 15-minute cron (`NotificationsService.sendBookingReminders`) finds confirmed bookings whose slot starts within 2 hours and haven't been reminded yet (`Booking.reminder_sent_at IS NULL`, owned by NotificationsModule the same way BookingsModule owns `booking_count`), fires email+push+log per booking, and stamps `reminder_sent_at` so it's never sent twice — condition-based catch-up (like the existing past-due/grace crons), not a narrow time-window match, so a missed tick still catches up on the next run.

**Announcements reuse the same dispatcher as system events**
`POST /communication/broadcast` (org_admin/gym_manager) targets every active member of a gym, or a picked subset via `member_ids`, and fans out through the exact same `notify()` call each system-triggered event uses — so a manual "gym closed for maintenance" announcement gets the identical email+push+inbox treatment as an automatic waitlist promotion.

**Reports: live queries only, no stored snapshots, no AI**
`ReportsModule` replaced the original `AiReport`/`OrgReport` entity stubs (Gemini-summarized daily/monthly reports, never implemented, deleted along with their `Gym`/`Organization` relations) with pure statistics — same "live query, not a stored record" precedent `VatService.orgRollup()` already set. `ReportsService.computeMetrics(gyms, start, end)` is the one aggregation function behind both `GET /reports/gyms/:gymId/stats` and `GET /reports/org/stats` (org rollup sums the per-gym numbers and **recomputes rates from the summed counts**, never averages per-gym rates) — 6 grouped SQL queries (`GROUP BY gym_id`, Postgres `FILTER (WHERE …)` for sub-breakdowns) regardless of how many gyms are asked for. Bookings/fill-rate are windowed on the **slot's** `starts_at` (classes that happened in the period), not booking `created_at`. Churn rate (`cancelled_in_period / (active_now + cancelled_in_period)`) is a documented approximation — there's no historical subscriber-count snapshot to divide against instead. `MemberSubscription` gained an `@UpdateDateColumn() updated_at` (previously absent) so "cancelled today" is queryable — a bare `sub.status = CANCELLED; save()` in `SubscriptionsService.cancel()` now bumps it for free.

**`bookings.checked_in` and `attendance.gym_check_ins` count two different events — the daily digest was silently reporting only one**
A staff member reported the end-of-day digest email's "Checked in" figure showing `0` on a day a member definitely checked in. Root cause: `GymMetrics.bookings.checked_in` (`COUNT(*) FILTER (WHERE b.status = 'checked_in')` on `Booking`, windowed on `Slot.starts_at`) only counts **class check-ins** — a member scanning the class QR (`POST /checkin/booking`) against a slot they'd booked. It has never counted the far more common gym-door check-in (`POST /checkin/entry` staff scan or `POST /checkin/gym-scan` member desk-QR scan), which writes to the separate `Attendance` table and has no relationship to `Booking` at all — a member can check into the gym every day without ever booking a class. `computeMetrics()` now runs a 6th grouped query against `Attendance.checked_in_at` (a `timestamp`, so it's windowed the same way as every other metric in this function — no date-string/timezone conversion needed) and exposes it as `attendance.gym_check_ins`, additive on the existing `attendance: { fill_rate, total_capacity, total_booked }` object (already-shipped API consumers are unaffected). `MailService.sendDailyDigest()` now shows both rows, relabeled for clarity — "Class check-ins" (`bookings.checked_in`, unchanged) and "Gym check-ins" (`attendance.gym_check_ins`, new) — instead of one ambiguous "Checked in" row that silently meant only the former. Note the naming collision this exposed: `GymMetrics.attendance` (class-slot fill-rate/capacity) and the `Attendance` entity (gym-door check-ins) are unrelated despite the identical word — worth remembering if this area gets touched again.

**Daily digest email bypasses NotificationsService on purpose**
`ReportsService.sendDailyDigests()` (23:55 daily) emails every active org_admin an end-of-day summary. It calls `MailService.sendDailyDigest()` directly instead of going through `NotificationsService.notify()` — `notify()` is member-scoped (loads a `Member`, writes to the member-only `NotificationLog` inbox), and an org_admin is a `StaffUser` with no in-app inbox anywhere in this system. Same narrow "call MailService directly" exception `InvoicesService.resend()` already established, for a different reason (recipient isn't a member at all, not "must throw on failure").

**Help & Legal content is hardcoded, not stored**
`HelpModule` (`GET /help/faqs`, `/help/privacy-policy`, `/help/terms`, `/help/membership-terms`, `/help/contact-support`) is deliberately DB-free — the module was requested with "any dummy data is valid, we'll update it later," so `HelpService` returns constants instead of standing up an entity/CRUD/admin-edit flow nobody asked for yet. Routes are `Public`-equivalent by omission: no controller carries `@UseGuards`, and since no `APP_GUARD` is registered globally, they're reachable unauthenticated without needing a `@Public()` decorator; the global `SubscriptionInterceptor` no-ops on them too (it only acts when `request.user` is populated by a JWT guard). If this needs to become staff-editable later, swap the constants for a single-row entity + `PATCH` — no route/shape change needed by callers.

**Check-in status is a plain read over `Attendance`, no new write path**
`GET /members/profile/checkin-status` (MemberJwt, same gym-resolution convention as `entry-qr`: `?gym_id=` optional, defaults to `primary_gym_id`, 403 if not affiliated) answers "did I check in today, and when did I last go" by reading the single most-recent `Attendance` row for that member+gym — no new table, no aggregation. `checked_in_today` compares that row's `date` against today's UTC calendar day; `last_check_in` (`null` if the member has never checked in there) reports `days_ago` as a plain integer and a `label` (`"today"` / `"yesterday"` / `"N days ago"`, unbounded — a month-old visit is just `"30 days ago"`, no special-casing). Lives on `BookingsController`'s `EntryQrController` next to `entry-qr` since `Attendance` is already owned there. See `CHECKIN_STATUS_OVERVIEW.md` + `CHECKIN_STATUS_POSTMAN_ENDPOINTS.md`.

**Attendance is derived from gym entry, not from subscription state**
`Attendance` (`member_id, gym_id, date`, unique per day) is written by one shared `BookingsService.markAttendanceOnce()` — an atomic `INSERT ... ON CONFLICT DO NOTHING` — called from both `checkinEntry()` (staff scans the member's personal entry QR) and the new `checkinGymScan()` (member scans a static per-gym desk QR themselves, `POST /checkin/gym-scan`). The desk QR is a long-lived (10-year) signed JWT with `typ: 'gym'`, printed once by staff via `GET /gyms/:id/qr` — the token itself grants nothing, since every scan still runs the same live `activeSubscription()` check the personal entry QR uses, so pause/cancel blocks entry through either method identically. Attendance and subscription lifecycle are deliberately independent: a subscription runs its full paid period whether the member shows up once or every day. `GET /subscriptions/me` surfaces this as three fields computed at read time (no new columns on `MemberSubscription`) via the pure `subscription-progress.util.ts` — `total_days` (period length), `days_left` (countdown to `current_period_end`), and `check_ins` (count of `Attendance` rows in the current period). Both `days_left` and the `check_ins` window freeze at `paused_at` while a subscription is paused rather than continuing to count down — consistent with `applyResume()` already shifting `current_period_end` forward by the exact days spent paused, so a paused member's progress numbers don't dip and jump. Once a subscription is `past_due` or `cancelled`, all three fields report `0` — there's no live progress left to show.

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
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to the Firebase Admin SDK service account JSON (mobile push). Falls back to a gitignored dev/testing key in `src/common/utils/`; if neither exists, mobile push is silently disabled and email + in-app notifications still work |
| `VAPID_PUBLIC_KEY` | Web push (browser) public key — generated via `npx web-push generate-vapid-keys`, given to the frontend for `PushManager.subscribe()`. Not a secret |
| `VAPID_PRIVATE_KEY` | Web push private key — pairs with `VAPID_PUBLIC_KEY`. Secret — never send to the frontend |
| `VAPID_SUBJECT` | Contact address for web push (`mailto:` or `https://`) required by the VAPID spec, sent to browser vendors' push services. Not a secret |
