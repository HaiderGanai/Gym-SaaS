# Resume Project Summary — Gym SaaS

Reference material for resume / LinkedIn / portfolio use. Pick and adapt bullets
to fit the space you have — don't paste this whole file anywhere.

---

## One-line summary

Multi-tenant gym management SaaS (NestJS/TypeScript/PostgreSQL) serving multiple
organizations and branches from a single deployment — staff/member management,
class scheduling, subscription billing with VAT, and platform-level SaaS billing.

## Short project description (for a resume header / portfolio card)

Designed and built a multi-tenant B2B2C SaaS platform for gym chains from the
ground up: a 4-tier role hierarchy (platform owner → org admin → branch manager →
front desk) serving multiple organizations and branches from one deployment,
covering staff/member lifecycle management, RRULE-based recurring class
scheduling, QR-code check-in, subscription billing with VAT compliance, and a
Stripe-powered platform billing layer for charging the organizations themselves.

## Tech stack

**Backend:** Node.js, TypeScript, NestJS 11, PostgreSQL, TypeORM
**Auth:** Passport.js (JWT), bcrypt, role-based access control
**Payments:** Stripe (Checkout, Subscriptions, webhooks)
**Other:** Nodemailer, Firebase Cloud Messaging (push), Cloudinary (image
uploads), `rrule` (RFC 5545 recurrence), `@nestjs/schedule` (cron jobs)

## Resume bullet points

Pick 3–5 depending on the role you're applying for. Numbers are real counts
from the codebase, not filler.

**Scope-based access architecture**
- Designed a scope-based access architecture (not plain RBAC): a 4-tier staff
  role hierarchy (`super_admin → org_admin → gym_manager → front_desk`) gates
  *which* endpoints a caller can reach, while a second, independent layer
  derives *what data* they see — shared list/read endpoints (branches, staff,
  members, bookings) resolve their result scope server-side from claims baked
  into the signed JWT (org affiliation, granted branch IDs) instead of a
  client-supplied filter, so the same endpoint transparently returns the whole
  platform, one organization, or just a caller's assigned branches depending
  on who's asking — with no per-role branching duplicated across controllers,
  and no way to widen visibility by tampering with a query param.
- Modeled gym-branch access as many-to-many junction tables (staff↔gym,
  member↔gym) instead of direct foreign keys, enabling staff/members to belong
  to multiple branches with independent grant/revoke lifecycles.

**Payments / billing**
- Built a two-sided billing system: a Stripe-powered platform subscription
  layer (orgs pay the platform, per-branch pricing, automated 3-day grace
  period with dunning emails) fully decoupled from a member-facing billing
  engine (plans, discount codes, invoicing, VAT calculation, past-due
  automation) — zero shared code between the two to prevent cross-contamination
  of billing logic.
- Implemented Stripe Checkout + webhook-driven subscription lifecycle
  (`checkout.session.completed`, `invoice.paid/failed`,
  `customer.subscription.updated/deleted`) as the single source of truth for
  organization billing state.
- Centralized VAT/tax computation (rate overrides, tax-inclusive vs exclusive
  pricing, VAT-exempt handling) into one service reused by invoicing and
  compliance reporting.

**Scheduling / bookings**
- Built a recurring class-scheduling engine using RFC 5545 (`rrule`) templates
  that materialize into concrete, independently editable slot instances via a
  daily cron job, supporting "this occurrence only" vs "apply to future" edits
  without disrupting existing bookings.
- Implemented race-safe class booking with atomic capacity claims, automatic
  waitlist promotion, and derived (non-drifting) credit tracking for
  pay-as-you-go plans.
- Designed a dual QR-code check-in system (gym-door entry + per-class
  check-in) using short-lived signed JWTs with live database revocation, so a
  paused or cancelled membership is denied entry immediately — even for a
  QR code already generated on the member's phone.

**Notifications / integrations**
- Built a unified notification dispatcher fanning every member-facing event
  (booking reminders, waitlist promotions, invoices, announcements) out to
  email (Nodemailer) and push (Firebase) independently and best-effort, with a
  single audit-trail row per event powering the in-app notification inbox.
- Integrated Cloudinary for image uploads (org branding logos, member profile
  photos) and Stripe for both platform and (planned) member payment flows.

**Reporting**
- Built live, on-demand analytics (revenue, bookings, attendance, no-show
  rate, churn) computed via grouped SQL aggregation per branch and rolled up
  org-wide, plus an automated daily digest email to org administrators.

## Suggested resume line (condensed, single entry)

> **Gym Management SaaS** — Personal/freelance project. Built a multi-tenant
> backend (NestJS, TypeScript, PostgreSQL, Stripe) with a scope-based access
> architecture (JWT-derived tenant/branch scoping, not plain RBAC), recurring
> class scheduling, QR-based check-in, subscription billing with VAT, and
> automated reporting. 13 modules, 100+ endpoints, two independent Stripe
> integrations (platform billing + member billing).

---

*Source of truth for technical detail: `CLAUDE.md` in this repo. Update this
file if the resume framing needs to change, but keep CLAUDE.md as the
authoritative engineering reference — don't let the two drift into
contradicting each other on what's actually built.*
