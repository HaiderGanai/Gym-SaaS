# Feature Spec Gap Analysis — `Gym_Management_SaaS_Feature_Specification v1.md`

Compares the new spec (competitive analysis + full admin-panel/mobile-app/AI feature
list, MVP → Phase 2 → Phase 3 roadmap) against what's actually built in this repo
today. Source doc: `Gym_Management_SaaS_Feature_Specification v1.md` (repo root).
Codebase reference: `CLAUDE.md`.

**Headline finding:** the spec's entire MVP (Phase 1) is already built, and most of
its Phase 2 is too. The backend is ahead of the document, not behind it. What's
actually missing is narrow: two modules that were already scaffolded (entities +
module shell only, no logic) — `CommunicationModule`'s push/notification-log side
and all of `ReportsModule` — plus a handful of small fields/endpoints the spec calls
out that nothing in the codebase currently covers. Nothing here requires a new
architectural direction; it's additive to existing modules.

---

## 1. Status by spec section

### 4.1 Membership & Member Management — **done**
| Spec feature | Status |
|---|---|
| Member CRM (profile, status, payment history, attendance) | ✅ `MembersModule`, `GET /members/:id` |
| Membership Plans (monthly/weekly/yearly/PAYG/class-pack) | ✅ `PlansModule`, `PlanType` enum covers all five |
| Onboarding & waivers with e-signature | ✅ `Waiver` entity (`signature_url`, `ip_address`, `signed_at`) — frontend supplies the signature capture/upload, backend just persists it |
| Pause/Freeze membership | ✅ `PATCH /subscriptions/:id/pause` + `PATCH /members/:id/status` (member-level pause with dates) |
| Family/Group accounts | ❌ missing — no linkage between member rows for shared billing |

### 4.2 Booking, Scheduling & Slot Management — **done**
Everything here is built: recurring calendar (`SlotTemplate` + RRULE), custom
one-off slots, enable/disable, capacity + waitlist with auto-promotion, booking
window + cancellation cutoff rules, "save a template and it keeps generating"
(the materialization cron). Resource booking (rooms/equipment as bookable
alongside classes) is the one Could-Have not present — no `Resource` entity exists.

### 4.3 Payments, Billing & Invoicing — **mostly done**
| Spec feature | Status |
|---|---|
| Stripe processing | ✅ (platform billing side); member billing is manual cash/card by design (v1) |
| GoCardless (UK Direct Debit) | ⚠️ columns reserved (`gocardless_mandate_id`, `gocardless_merchant_id`) but no integration — spec lists this as **Phase 2**, not MVP |
| VAT/tax per invoice | ✅ `VatModule`, per-line VAT number, net/gross, tax-inclusive handling |
| Invoice generation & history | ⚠️ invoices are generated and emailed as **HTML**, not PDF. Spec says "Auto-generated PDF invoices/receipts" |
| POS (retail/PT sessions) | ❌ missing — Phase 3 in spec anyway |
| Discounts & promo codes | ✅ `PlansModule` discount CRUD, percentage/fixed, first-invoice-only |
| Multi-currency (GBP/USD) | ⚠️ `currency` is a free-text column on `Organization`/`Invoice`/`PlatformPlan`, defaulted `'GBP'` — there's no per-gym override and nothing formats/validates against it; effectively "one currency per org," not true multi-currency |

### 4.4 Communication Suite — **partially built**
This is the biggest real gap, and it's already flagged in `CLAUDE.md` §7 as
pending. What exists: `MailService` (Nodemailer) sending five hard-coded email
templates (staff/member invite, subscription reminder, invoice, slot-disabled,
waitlist-promoted, OTP). What's scaffolded but **not implemented**:
- `NotificationLog` entity exists (`src/communication/entities/notification-log.entity.ts`)
  but nothing ever writes a row to it — no service reads/writes it, so there is no
  send history in the codebase today.
- No `PushService` — no FCM/APNs integration at all.
- No in-app composer endpoint (staff picking a segment/member and firing an email).
- No "email templates library" concept — templates are inline HTML in `MailService`,
  not a manageable set.
- No SMS (spec marks this Could-Have / Phase 3 anyway).

### 4.5 Staff & Access Management — **done**, one gap
| Spec feature | Status |
|---|---|
| RBAC (Owner/Manager/Front Desk/Trainer) | ✅ `super_admin`→`org_admin`→`gym_manager`→`front_desk` |
| Check-in/attendance (QR or manual) | ✅ `BookingsModule` — class QR + gym-door entry QR, staff scan endpoints |
| Multi-location support | ✅ Organization→Gym hierarchy is multi-branch from day one (spec marks this Could-Have/Phase 2, already exceeded) |
| Staff scheduling (assign trainers to classes/shifts) | ⚠️ half-done — `SlotTemplate`/`Slot` have `instructor_id` (a trainer *is* assigned to a class), but there's no shift/availability concept independent of classes |

### 5. Member Mobile App — **backend-ready**
This section describes a mobile client, which is out of this backend's scope, but
every API it needs already exists: dashboard data (`GET /subscriptions/me`,
`GET /members/me`), slot browse/book/cancel/waitlist, push (not built, see 4.4),
online payments view (`GET /invoices/me`), QR check-in, profile self-update. No
backend gap beyond the push piece already noted.

### 6. AI-Powered Features — **not started**
`ReportsModule` is registered in `app.module.ts` and has `AiReport`/`OrgReport`
entities defined with the exact shape the spec implies (`raw_metrics` jsonb with
bookings/revenue/check-ins/no-shows/new-members/failed-payments/churn-risk-members
on `AiReport`; per-gym rollup + org totals on `OrgReport`) — but there is **no
service, no controller, no cron, and no LLM call**. It's a schema with nothing
behind it. This is exactly `CLAUDE.md`'s "Automated Daily Report Generation" —
the spec's own recommended **first AI feature to build** (§6 implementation
note) — and it's the most-scaffolded, least-built piece of the whole codebase.
Member Communication Assistant, Smart Booking Recommendations, Churn Prediction,
Chat Support, NL Reporting are all correctly Phase 2/3 and not expected yet.

### 7. Reporting & Analytics — **partially covered by raw data, no reports**
Revenue, attendance, growth/churn numbers are all derivable from existing tables
(`Invoice`, `Booking`, `MemberSubscription`) via ad-hoc queries, but there is no
report-generation endpoint and no CSV/Excel export anywhere in the codebase.

### 3.2 Compliance — **not addressed**
No explicit GDPR/CCPA workflow: no data-export endpoint, no right-to-erasure
(hard-delete-on-request) endpoint, no consent-capture field on `Member` for
marketing emails (relevant for CAN-SPAM/PECR unsubscribe compliance once a
marketing-email composer exists). Not flagged as MVP in the spec, but worth
tracking since it gates the Communication Suite work in 4.4.

---

## 2. Consolidated gap list (what's actually missing)

| # | Gap | Spec priority | Size | Blocks |
|---|---|---|---|---|
| 1 | `ReportsModule` has zero logic — no daily AI report job, no controller, no email delivery | **Must-Have** (spec explicitly says build this first) | Medium | Nothing; self-contained |
| 2 | `CommunicationModule`: no `NotificationLog` writes, no push service, no in-app composer endpoint | Must-Have (reminders/composer) / Should-Have (push infra) | Medium | Booking reminders, push notifications |
| 3 | Automated booking reminders (X hours before class) | Must-Have | Small–Medium | Depends on #2's log + a cron |
| 4 | Invoices are HTML-email only, no PDF | Must-Have | Small–Medium (new dependency) | Nothing; additive to `InvoicesModule` |
| 5 | No CSV/Excel export (members, transactions, bookings) | Should-Have | Small | Nothing |
| 6 | Churn-risk flagging | Should-Have (Phase 2) | Small | Feeds into #1's report once #1 exists |
| 7 | GoCardless Direct Debit | Must-Have for UK per §3.1, but spec roadmap places it in Phase 2 | Large (new payment integration) | Nothing; parallel to Stripe |
| 8 | Multi-currency (true per-gym currency, not just a stored string) | Should-Have | Small | Nothing |
| 9 | GDPR/CCPA data export + erasure endpoints | Not in MVP list explicitly, but §3.2 says "day one" | Small–Medium | Marketing email composer (consent) |
| 10 | Family/Group billing accounts | Could-Have | Medium (new relation) | Nothing |
| 11 | Resource booking (rooms/equipment) | Could-Have | Medium | Nothing |
| 12 | POS (retail/PT sessions) | Should-Have, but Phase 3 per roadmap | Large | Nothing |
| 13 | SMS notifications | Could-Have, Phase 3 | Small (once #2 exists, it's a channel) | #2 |
| 14 | Independent staff shift scheduling (not tied to a class) | Should-Have | Medium | Nothing |

---

## 3. Proposed course of action

Given the spec's own phasing (§8) and how close this codebase already is to MVP +
much of Phase 2, the sane order is: **finish what's already scaffolded before
starting anything new.**

**Step 1 — ReportsModule (AI daily report).** This is the one item the spec calls
out by name as the highest-value, lowest-complexity AI feature, and it's the
furthest-along "started but not built" module in the repo (entities exist, shape
already matches the spec's metrics). Build:
- `ReportsService.collectDailyMetrics(gymId, date)` — aggregate from existing
  `Booking`/`Invoice`/`MemberSubscription` tables (no new source data needed).
- One LLM call (need to pick a provider — spec says OpenAI, but this repo's
  `CLAUDE.md` earlier referenced Gemini for reports; needs a decision, not a
  default) to turn `raw_metrics` into `summary`.
- A daily cron (mirrors the existing `@nestjs/schedule` pattern already used for
  the slot-materialization and past-due crons) that generates + emails the report
  to each gym's manager(s).
- `GET /reports/daily?gym_id=&date=` for on-demand admin-panel viewing of past
  reports (list already-generated `AiReport` rows).
- `OrgReport` follows the same shape one level up, generated monthly per §Build
  Status precedent ("monthly org-level report" already named in `CLAUDE.md` §7).

**Step 2 — CommunicationModule completion.** Wire `NotificationLog` into
`MailService` (log every send, success or failure — the entity and enum already
support this, it's currently just unused). Add:
- Automated booking reminders: a cron querying upcoming confirmed bookings within
  a configurable window (e.g., 2h before `starts_at`) that haven't been reminded
  yet (`NotificationLog` gives us the "already sent" check for free), emails via
  existing `MailService` pattern.
- In-app composer: `POST /communication/email` (staff, gym-scoped) taking a
  segment filter (`all` / `gym_id` / `member_ids[]`) and subject/body, logging each
  send.
- Push notifications are a **separate decision point** — no FCM/APNs credentials
  or SDK exist in this repo yet, and adding one is a real integration, not a small
  change. Recommend scoping push to its own follow-up once reminders/composer (the
  Must-Have items) are done, per spec's own Must-Have/Should-Have split in §4.4.

**Step 3 — Small, self-contained additions** (any order, each is a same-day change):
- PDF invoices: add a lightweight PDF lib (none currently installed — `pdfkit` is
  the standard lazy choice, template-free, streams straight from the existing
  invoice fields) and a `GET /invoices/:id/pdf` endpoint; keep the HTML email as-is
  for the email body, attach the PDF.
- CSV export: `GET /members?format=csv`, `GET /invoices?format=csv`,
  `GET /bookings?format=csv` — reuse the exact same scoped queries each endpoint
  already runs, just stream CSV instead of JSON when the query param is set. No new
  dependency needed (hand-rolled CSV from existing DTOs is a few lines).
- Multi-currency: promote `currency` from a free-text default on `Organization` to
  something gyms can override (`Gym.currency ?? Organization.currency`), same
  pattern as the existing tax-mode override chain (`plan.vat_rate_override →
  gym.default_tax_rate`). Small, no new table.

**Step 4 — Defer to their stated phase, don't build now:** GoCardless (Phase 2,
large — needs its own mandate/webhook flow mirroring what Stripe already has),
POS (Phase 3), family/group accounts (Could-Have), resource booking (Could-Have),
SMS (Phase 3), workout tracking (Phase 3), AI chat/NL reporting (Phase 3). Building
any of these now would be scope creep relative to what the spec itself prioritizes.

**Not recommended to build speculatively:** GDPR/CCPA erasure and consent capture
should be scoped only once the in-app email composer (Step 2) exists, since
consent tracking is meaningless without a marketing-send feature to gate. Building
it earlier is dead code.

---

## 4. What this means practically

If "small changes" is the actual budget, the realistic small-change set is:
**Step 3 in full** (PDF invoices, CSV export, multi-currency override) — each is a
same-day addition to an existing module with no new architecture. **Step 1 and 2**
are real modules with crons, new endpoints, and (for Step 1) a provider decision;
they're scoped small individually but aren't a "small change" in aggregate — they're
the two modules `CLAUDE.md` already lists as pending, just newly justified by this
spec rather than newly discovered.
