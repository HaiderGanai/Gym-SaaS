# ReportsModule — Postman Endpoints

Base URL (dev): `http://localhost:3000/api/v1`
All requests: `Authorization: Bearer <staff token>` (org_admin or
gym_manager, as noted per endpoint). Both endpoints are `GET`, no body.

Dates are plain `YYYY-MM-DD` (or any ISO string `Date` can parse). The range
is `[period_start, period_end)` — `period_end` is exclusive, so pass the day
*after* the last day you want included (e.g. for "all of July,"
`period_end=2026-08-01`).

---

## 1. Per-gym statistics

**GET** `/reports/gyms/:gymId/stats?period_start=2026-07-01&period_end=2026-08-01`

Staff token — `org_admin` (any gym in their org) or `gym_manager` (their own
gym only).

**200:**
```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "gym_name": "Downtown Branch",
  "revenue": {
    "total": 4820.00,
    "invoice_count": 63,
    "by_payment_method": { "cash": 1200.00, "card": 3420.00, "other": 200.00 }
  },
  "bookings": {
    "confirmed": 12,
    "checked_in": 210,
    "no_show": 18,
    "cancelled": 34,
    "waitlisted": 4,
    "no_show_rate": 7.89
  },
  "attendance": {
    "fill_rate": 68.4,
    "total_capacity": 400,
    "total_booked": 274
  },
  "members": {
    "new_members": 9,
    "active_members": 142,
    "active_subscriptions": 138,
    "cancelled_subscriptions": 5,
    "churn_rate": 3.5
  }
}
```

**403** if the staff caller doesn't have access to `gymId`.

---

## 2. Org-wide rollup + per-gym breakdown

**GET** `/reports/org/stats?period_start=2026-07-01&period_end=2026-08-01`

Staff token — `org_admin` only (resolves the org from the caller's own
`org_id`; a `super_admin` gets `400` here — use endpoint 1 per gym instead).

**200:**
```json
{
  "period_start": "2026-07-01",
  "period_end": "2026-08-01",
  "gyms": [
    {
      "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
      "gym_name": "Downtown Branch",
      "revenue": { "total": 4820.00, "invoice_count": 63, "by_payment_method": { "cash": 1200.00, "card": 3420.00, "other": 200.00 } },
      "bookings": { "confirmed": 12, "checked_in": 210, "no_show": 18, "cancelled": 34, "waitlisted": 4, "no_show_rate": 7.89 },
      "attendance": { "fill_rate": 68.4, "total_capacity": 400, "total_booked": 274 },
      "members": { "new_members": 9, "active_members": 142, "active_subscriptions": 138, "cancelled_subscriptions": 5, "churn_rate": 3.5 }
    },
    {
      "gym_id": "b7e1...",
      "gym_name": "Uptown Branch",
      "revenue": { "total": 2110.00, "invoice_count": 27, "by_payment_method": { "cash": 500.00, "card": 1610.00, "other": 0 } },
      "bookings": { "confirmed": 3, "checked_in": 88, "no_show": 6, "cancelled": 11, "waitlisted": 0, "no_show_rate": 6.38 },
      "attendance": { "fill_rate": 55.0, "total_capacity": 200, "total_booked": 110 },
      "members": { "new_members": 4, "active_members": 61, "active_subscriptions": 58, "cancelled_subscriptions": 2, "churn_rate": 3.33 }
    }
  ],
  "totals": {
    "revenue": { "total": 6930.00, "invoice_count": 90, "by_payment_method": { "cash": 1700.00, "card": 5030.00, "other": 200.00 } },
    "bookings": { "confirmed": 15, "checked_in": 298, "no_show": 24, "cancelled": 45, "waitlisted": 4, "no_show_rate": 7.45 },
    "attendance": { "fill_rate": 64.0, "total_capacity": 600, "total_booked": 384 },
    "members": { "new_members": 13, "active_members": 203, "active_subscriptions": 196, "cancelled_subscriptions": 7, "churn_rate": 3.45 }
  }
}
```

`totals` rates are recomputed from the summed numerators/denominators
across gyms — not an average of the per-gym rates.

---

## What you'll never call directly

There's no endpoint to trigger the daily digest email — it fires on its own
every day at 23:55 server time, to every active `org_admin`. To see it
without waiting: seed some paid invoices / bookings / cancellations for
today, then either wait for the cron tick or temporarily change the cron
expression in `reports.service.ts` while testing locally.

There's no `GET /reports/gyms/:gymId/stats` equivalent for `front_desk` —
this is admin/manager-facing reporting, same role pairing VAT summaries use.

---

## Quick test recipe (Postman order)

1. Staff (org_admin) login.
2. `PATCH /invoices/:id/pay` on a couple of existing invoices, dated today —
   or run through the normal subscribe → invoice → pay flow to generate
   fresh ones.
3. `GET /reports/gyms/:gymId/stats?period_start=<today>&period_end=<tomorrow>`
   — confirm revenue and invoice_count reflect what you just paid.
4. Book a class, check a member in via `POST /checkin/booking`, mark another
   `PATCH /bookings/:id/no-show` — re-run step 3, confirm `bookings` and
   `attendance` moved.
5. `PATCH /subscriptions/:id/cancel` on a subscription — re-run step 3,
   confirm `cancelled_subscriptions` and `churn_rate` moved.
6. `GET /reports/org/stats?period_start=<today>&period_end=<tomorrow>` —
   confirm the org `totals` match the sum of every gym you have access to.
