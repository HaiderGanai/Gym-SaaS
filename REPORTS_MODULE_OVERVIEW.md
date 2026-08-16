# ReportsModule — How It Works Inside

The feature spec calls this "AI daily reports" — Gemini/OpenAI-generated
summaries with churn prediction. This build deliberately skips the AI layer:
`ReportsModule` is a pure statistics engine. Every number is a real SQL
aggregation, computed live, no LLM in the loop. If AI-generated narrative
summaries are wanted later, they'd sit on top of this module's numbers, not
replace them.

Base URL prefix: `/api/v1`. Endpoint bodies and example responses live in
`REPORTS_POSTMAN_ENDPOINTS.md`.

---

## 1. Why no stored report rows

The original entity stubs (`AiReport` per gym, `OrgReport` per org) were
designed to hold a Gemini-written `summary` string plus a JSON snapshot,
regenerated once a day. Without AI narration there's nothing to justify
storing a frozen snapshot — the same query that would populate the snapshot
can just as well answer a live request for any date range. This follows the
precedent already set by `VatService.orgRollup()`: **live query, not a
stored record.** `AiReport`/`OrgReport` and their relations on `Gym`/
`Organization` were deleted rather than repurposed — they were dead code
(never read anywhere) blocking this from being a clean live-query module.

The only thing that *is* persisted is the daily digest **email** — not a
database row of it. If a "show me what changed over time" trend feature is
ever requested, that's the moment to add a stored snapshot table; nothing
here should be read as ruling it out later.

---

## 2. The two endpoints, one aggregation engine

`ReportsService.computeMetrics(gyms, start, end)` is the one place every
number comes from — both endpoints and the daily-digest cron all call it.
It takes a list of gyms and a date range and returns one `GymMetrics` object
per gym, via **6 grouped SQL queries** (`GROUP BY gym_id`), regardless of
whether 1 gym or an org's whole roster was asked for:

1. **Revenue** — `SUM(invoice.amount)` where `status = paid`, filtered on
   `paid_at`, with a payment-method breakdown (`cash` / `card` / `other`)
   using Postgres `FILTER (WHERE …)` inside the aggregate instead of three
   separate queries.
2. **Bookings** — booking status counts (`confirmed`, `checked_in`,
   `no_show`, `cancelled`, `waitlisted`), filtered on the **slot's**
   `starts_at` (i.e. "classes that happened in this window"), not the
   booking's `created_at`.
3. **Capacity/fill** — `SUM(slot.capacity)` vs `SUM(slot.booking_count)`
   over the same `starts_at` window, for the fill-rate percentage.
4. **Gym check-ins** — `COUNT(*)` of `Attendance` rows filtered on
   `checked_in_at`, exposed as `attendance.gym_check_ins`. Distinct from
   `bookings.checked_in` above: `Attendance` is written by the gym-door
   check-in flow (staff-scanned entry QR / member-scanned desk QR, one row
   per member/gym/day), independent of whether the member ever booked a
   class — a gym that only does walk-in check-ins would otherwise always
   show `bookings.checked_in: 0`.
5. **Members** — active member-gym-access count (a snapshot, "as of now")
   and new-access-grants count (period-scoped on `granted_at`), one query
   with two `FILTER` clauses.
6. **Subscriptions** — currently-active count (`active`/`past_due`/`paused`)
   and cancelled-in-period count, one query with two `FILTER` clauses.

`GET /reports/gyms/:gymId/stats` calls this with a single gym.
`GET /reports/org/stats` calls it with every gym in the org, then sums the
per-gym numbers into an `totals` block — rates (fill rate, no-show rate,
churn rate) are **recomputed from the summed numerator/denominator**, never
averaged-of-averages, so a small gym with a wild churn rate doesn't skew the
org total.

---

## 3. Metric definitions worth knowing

- **No-show rate** = `no_show / (checked_in + no_show)`. Confirmed bookings
  whose class hasn't happened yet aren't counted in either side.
- **Fill rate** = `total_booked / total_capacity` across slots that started
  in the window. `slot.booking_count` already excludes cancelled bookings
  (BookingsModule's invariant — see `CLAUDE.md` §8), so this is already the
  right numerator with no extra filtering.
- **Churn rate** = `cancelled_in_period / (active_now + cancelled_in_period)`.
  This is an approximation: the schema has no historical subscriber-count
  snapshot to divide cancellations against ("how many were subscribed at the
  *start* of the period"), so the denominator is reconstructed from the
  subscriber base the cancellations were drawn from. Good enough for a daily
  operational number; not audit-grade cohort analysis.
- **New members** (per gym) = new `MemberGymAccess` rows granted in the
  period, not new `Member` rows — a `Member` has no `gym_id` of its own (see
  `CLAUDE.md` §8 "Junction tables for gym access"), so "new to this gym" is
  read off the access grant, which is also what makes multi-gym members earn
  a "new member" count at each gym they join.
- **Cancelled subscriptions** (per gym) = `MemberSubscription` rows where
  `status = cancelled` and `updated_at` falls in the period.
  `MemberSubscription` had no update timestamp before this module — a bare
  status flip in `cancel()`/`pause()`/`resume()` never touched `updated_at`
  because the column didn't exist. Added `@UpdateDateColumn()` to the entity
  (see `subscriptions/entities/member-subscription.entity.ts`) — same
  pattern already used on `OrgSubscription`.

---

## 4. Access control

Mirrors `VatModule` exactly:

- `GET /reports/gyms/:gymId/stats` — `org_admin` or `gym_manager`, gated
  through `assertGymAccess()` (gym_manager limited to their own gym(s),
  org_admin any gym in their org, super_admin any gym anywhere).
- `GET /reports/org/stats` — `org_admin` only. Resolves the org from
  `user.org_id` — a `super_admin` has no `org_id` and gets a
  `400 Bad Request` telling them to use the per-gym endpoint instead
  (identical to `VatService.orgRollup`'s guard).

`front_desk` has no access to either — this is admin/manager-facing
reporting, same role pairing as VAT summaries and slot disable/enable.

---

## 5. The daily digest email

```ts
@Cron('55 23 * * *')
async sendDailyDigests()
```

Once a day (23:55 server time — "end of day"), for every **active
`org_admin`** in the system:

1. Groups admins by `organization_id` (an org can have more than one
   org_admin — each one gets their own email).
2. Computes "today" (server-time midnight → midnight) metrics for every gym
   in that org via the same `computeMetrics()` used by the live endpoints.
3. Emails each org_admin a summary: total revenue, invoice count, bookings
   confirmed/checked-in/no-show, new members, cancelled subscriptions — plus
   a per-branch breakdown table if the org has more than one gym.
4. One org's failure (a bad email, a DB hiccup) is caught and logged —
   it doesn't stop the other orgs' digests from sending (`Promise.allSettled`
   per org-admin, try/catch per org, same resilience pattern as the existing
   `pastDueCron`/`graceCron`/booking-reminder cron).

**Known simplification:** the window is server-time midnight-to-midnight,
not gym-timezone-aware. `Gym.timezone` exists as a field but nothing else in
this codebase schedules per-gym-timezone crons either (`horizonCron`,
`pastDueCron`, `graceCron` are all plain server-time) — this follows the
same established convention rather than introducing the only
timezone-aware cron in the app.

---

## 6. Why this bypasses `NotificationsService`

`NotificationsService.notify()` is member-scoped by design — it loads a
`Member` row, writes to `NotificationLog` (which has a mandatory
`member_id`), and the in-app inbox it powers only exists for members. An
org_admin is a `StaffUser`, not a `Member`, and staff have no in-app
notification inbox anywhere in this system. So the digest calls
`MailService.sendDailyDigest()` directly — the same narrow exception
pattern `InvoicesService.resend()` already uses, extended to a second,
unrelated reason: not "must throw on failure" this time, but "the recipient
isn't a member at all."

---

## 7. Design decisions worth remembering

- **No AI, no persisted snapshots, no natural-language queries** — those are
  the spec's Should-Have/Could-Have items (churn *prediction*, "ask a
  question" reporting) and were explicitly deprioritized. This module hands
  a future AI layer clean numbers to summarize; it doesn't do the
  summarizing itself.
- **One aggregation function, two call sites, one cron** — `gymStats()` and
  `orgStats()` both go through `computeMetrics()`; the digest cron reuses it
  a third time. No duplicated query logic.
- **Rates are recomputed at rollup time, never averaged** — org-level
  no-show/fill/churn rates come from summed counts, not `avg(gym rates)`.
