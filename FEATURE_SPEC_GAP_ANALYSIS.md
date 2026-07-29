# Feature Spec Gap Analysis — `Gym_Management_SaaS_Feature_Specification v1.md`

Compares the new spec (competitive analysis + full admin-panel/mobile-app/AI feature
list, MVP → Phase 2 → Phase 3 roadmap) against what's actually built in this repo
today. Source doc: `Gym_Management_SaaS_Feature_Specification v1.md` (repo root).
Codebase reference: `CLAUDE.md`.

**Headline finding:** the spec's entire MVP (Phase 1) is already built, and most of
its Phase 2 is too. The backend is ahead of the document, not behind it.

**Update (2026-07-22): §4.4 Communication Suite is now implemented** — see §0
below.

**Update (2026-07-29): §6/§7 Reporting & Analytics is now implemented, minus
AI** — see §0 below. `ReportsModule` ships live statistics endpoints and a
daily digest email; the spec's AI-summarization layer (Gemini/OpenAI) was
explicitly deprioritized by product decision, not a technical gap.

What's left is narrower: a handful of small fields/endpoints the spec calls
out that nothing in the codebase currently covers. Nothing here requires a
new architectural direction; it's additive to existing modules.

---

## 0. Implemented since this document was first written

**CommunicationModule + NotificationsModule (2026-07-22)** — the §4.4 gap
(originally the largest one in this document) is closed. Every member-facing
email now fires alongside a push notification (Firebase Cloud Messaging) and an
in-app inbox row, from one shared dispatcher (`NotificationsService.notify()`).
Delivered:
- ✅ `NotificationLog` wired up for real — every send (email and/or push) writes
  a row; it's simultaneously the delivery audit log and the member's in-app feed.
- ✅ Push notifications — `FirebaseService` (FCM), boots best-effort off
  `FIREBASE_SERVICE_ACCOUNT_PATH` (falls back to a gitignored dev/testing key).
- ✅ Automated booking reminders — 15-minute cron, 2h lead time before class
  start, email + push + log. This was the spec's Must-Have item that had zero
  implementation before.
- ✅ In-app email/push composer — `POST /communication/broadcast`
  (org_admin/gym_manager), targets a gym's members (all, or a picked list).
- ✅ Member notification inbox — `GET /notifications`,
  `GET /notifications/unread-count`, `PATCH /notifications/:id/read`,
  `PATCH /notifications/read-all`.
- ✅ Device-token registration — `POST`/`DELETE /notifications/device-token`
  (the `Member.fcm_token` column already existed but nothing populated it).

Full detail: `COMMUNICATION_MODULE_OVERVIEW.md` + `COMMUNICATION_POSTMAN_ENDPOINTS.md`.

**Still not done from the original §4.4 gap list:** SMS (still Could-Have/Phase 3
in the spec; the push infrastructure built here makes SMS a smaller add later —
same dispatcher, one more channel), an "email templates library" as a manageable/
editable concept (templates are still inline HTML in `MailService`, not
data-driven — not asked for, not blocking anything).

**ReportsModule (2026-07-29)** — explicitly scoped as **statistics, not AI**
by product decision: "we won't go with [AI] right now." Delivered:
- ✅ `GET /reports/gyms/:gymId/stats` — per-gym revenue (+ payment-method
  split), bookings, attendance/fill-rate, no-show rate, new members, active
  members, active/cancelled subscriptions, churn rate. Live query, any date
  range.
- ✅ `GET /reports/org/stats` — org-wide rollup + per-gym breakdown, same
  metrics, rates recomputed from summed counts (not averaged).
- ✅ Automated end-of-day digest email — daily 23:55 cron, every active
  org_admin, today's revenue/bookings/new-members/cancelled-subscriptions,
  per-branch table if the org has more than one gym.
- ❌ **Deliberately not built**: LLM-generated narrative summary, churn
  *prediction* (flagging individual at-risk members), natural-language
  reporting queries — all correctly Phase 2/3 per the spec's own roadmap, and
  explicitly deferred by product decision for the statistics-only layer too.
- The original `AiReport`/`OrgReport` entity stubs (dead code — zero service,
  zero controller, never read anywhere) were deleted rather than repurposed;
  `ReportsModule` computes everything live instead of storing snapshots, same
  precedent `VatService.orgRollup()` already set.

Full detail: `REPORTS_MODULE_OVERVIEW.md` + `REPORTS_POSTMAN_ENDPOINTS.md`.

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

### 4.4 Communication Suite — **done** ✅ (2026-07-22)
| Spec feature | Status |
|---|---|
| In-App Email Composer | ✅ `POST /communication/broadcast` — staff picks a gym (+ optional member list), fires email+push+inbox to every target |
| Push Notification Manager | ✅ `FirebaseService` (FCM) — every member-facing event now pushes, not just emails |
| Automated Booking Reminders | ✅ 15-min cron, 2h lead time, `Booking.reminder_sent_at` |
| Email Templates Library | ⚠️ still inline HTML in `MailService`, not a manageable/editable set — not blocking, not asked for |
| SMS Notifications | ❌ still missing (spec: Could-Have/Phase 3) — the new push dispatcher makes this a smaller add later (one more channel on the same `notify()` call) |

See `COMMUNICATION_MODULE_OVERVIEW.md` + `COMMUNICATION_POSTMAN_ENDPOINTS.md` for
full detail. `NotificationLog` (previously scaffolded with nothing writing to it)
is now the live delivery log + member in-app inbox for every send.

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
`GET /members/me`), slot browse/book/cancel/waitlist, push (✅ now built, see 4.4
— the app just needs to call `POST /notifications/device-token` after login),
online payments view (`GET /invoices/me`), QR check-in, profile self-update,
in-app messaging/announcements feed (✅ `GET /notifications`). No backend gap
remains for this section.

### 6. AI-Powered Features — **statistics layer done (2026-07-29), AI layer explicitly deferred**
"Automated Daily Report Generation" is built as a pure-statistics feature — a
daily digest email to every org_admin with revenue/bookings/new-members/
cancelled-subscriptions — but with **no LLM call**, by explicit product
decision ("we won't go with [AI] right now"). The original `AiReport`/
`OrgReport` entity stubs this section used to describe were dead code (never
had a service/controller/cron behind them) and have been deleted; `ReportsModule`
computes everything live instead. Member Communication Assistant, Smart
Booking Recommendations, Churn *Prediction* (flagging individual at-risk
members), Chat Support, and NL Reporting remain correctly un-built —
Phase 2/3 items, not expected yet.

### 7. Reporting & Analytics — **done** ✅ (2026-07-29)
Revenue, attendance, growth/churn numbers are now exposed as live statistics
endpoints (`GET /reports/gyms/:gymId/stats`, `GET /reports/org/stats`) instead
of sitting only in raw tables — see §0. No CSV/Excel export yet (still a gap,
see consolidated list #5).

### 3.2 Compliance — **not addressed**
No explicit GDPR/CCPA workflow: no data-export endpoint, no right-to-erasure
(hard-delete-on-request) endpoint, no consent-capture field on `Member` for
marketing emails (relevant for CAN-SPAM/PECR unsubscribe compliance once a
marketing-email composer exists). Not flagged as MVP in the spec, but worth
tracking since it gates the Communication Suite work in 4.4.

---

## 2. Consolidated gap list (what's actually missing)

| # | Gap | Spec priority | Size | Status |
|---|---|---|---|---|
| ~~1~~ | ~~`CommunicationModule`: no `NotificationLog` writes, no push service, no in-app composer endpoint~~ | Must-Have / Should-Have | Medium | ✅ **Done 2026-07-22** — see §0 |
| ~~2~~ | ~~Automated booking reminders (X hours before class)~~ | Must-Have | Small–Medium | ✅ **Done 2026-07-22** — see §0 |
| ~~3~~ | ~~`ReportsModule` has zero logic — no daily report job, no controller, no email delivery~~ | **Must-Have** (spec explicitly says build this first) | Medium | ✅ **Done 2026-07-29** — statistics only, no AI (product decision) — see §0 |
| 4 | Invoices are HTML-email only, no PDF | Must-Have | Small–Medium (new dependency) | Remaining |
| 5 | No CSV/Excel export (members, transactions, bookings) | Should-Have | Small | Remaining |
| 6 | Churn-risk *flagging* (naming individual at-risk members) | Should-Have (Phase 2) | Small | Remaining — churn *rate* is now surfaced (#3), per-member risk flagging is not |
| 7 | GoCardless Direct Debit | Must-Have for UK per §3.1, but spec roadmap places it in Phase 2 | Large (new payment integration) | Remaining |
| 8 | Multi-currency (true per-gym currency, not just a stored string) | Should-Have | Small | Remaining |
| 9 | GDPR/CCPA data export + erasure endpoints | Not in MVP list explicitly, but §3.2 says "day one" | Small–Medium | Remaining |
| 10 | Family/Group billing accounts | Could-Have | Medium (new relation) | Remaining |
| 11 | Resource booking (rooms/equipment) | Could-Have | Medium | Remaining |
| 12 | POS (retail/PT sessions) | Should-Have, but Phase 3 per roadmap | Large | Remaining |
| 13 | SMS notifications | Could-Have, Phase 3 | Small (push dispatcher already exists — one more channel) | Remaining |
| 14 | Independent staff shift scheduling (not tied to a class) | Should-Have | Medium | Remaining |

---

## 3. Proposed course of action

Given the spec's own phasing (§8) and how close this codebase already is to MVP +
much of Phase 2, the sane order is: **finish what's already scaffolded before
starting anything new.** Step 2 (CommunicationModule) below is now done — see §0.
Remaining, in order:

**~~Step 1 — ReportsModule (daily report).~~ ✅ Done 2026-07-29** — see §0 at
the top of this document and `REPORTS_MODULE_OVERVIEW.md` for the full
implementation. Built as **live statistics endpoints + a daily digest email**,
not an LLM-summarized report — the AI/LLM-provider decision this step
originally flagged as blocking was resolved by removing AI from scope
entirely, not by picking a provider. On-demand viewing is the two live
endpoints (`GET /reports/gyms/:gymId/stats`, `GET /reports/org/stats` with
`?period_start=&period_end=`) rather than a stored-report list — there's
nothing to page through because nothing is stored; any historical range is
just a different query.

**~~Step 2 — CommunicationModule completion.~~ ✅ Done 2026-07-22** — see §0 at
the top of this document and `COMMUNICATION_MODULE_OVERVIEW.md` for the full
implementation (push notifications included — the original plan below deferred
push as "a separate decision point"; it turned out to be small enough to do in
the same pass once a Firebase service account was available for testing).

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

Of the two modules originally flagged as pending, both are now done:
**CommunicationModule** (§0, 2026-07-22) and **ReportsModule** (§0, 2026-07-29,
statistics only — AI narration explicitly out of scope by product decision).
What's left is **Step 3 in full** (PDF invoices, CSV export, multi-currency
override — each a same-day addition to an existing module with no new
architecture), plus Step 3's now-obvious follow-on: CSV export for the new
`/reports/*` endpoints would be a natural extension of gap #5 once that step
is picked up. Step 4's deferred items (GoCardless, POS, family accounts,
resource booking, SMS, workout tracking, AI chat/NL reporting, churn-*prediction*
flagging) remain correctly out of scope until their stated phase.
