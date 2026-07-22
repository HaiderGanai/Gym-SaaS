# CommunicationModule + NotificationsModule — How It Works Inside

Every member-facing "something happened" moment in the app — from a class getting
cancelled to a spot opening up on the waitlist — now goes out on two channels
(email + push) and lands in an in-app inbox, all from one call site. This is the
module that turns "we sent an email" into "we notified the member."

Base URL prefix: `/api/v1`. Endpoint bodies and example responses live in
`COMMUNICATION_POSTMAN_ENDPOINTS.md`.

---

## 1. Why two modules

- **`CommunicationModule`** is deliberately small: it owns `MailService`
  (Nodemailer — every email template lives here) and the `NotificationLog`
  entity definition. Nothing outside `NotificationsModule` should ever inject
  `MailService` directly anymore, except one narrow exception (§5).
- **`NotificationsModule`** is the actual communication layer: it owns the
  dispatch logic (`NotificationsService`), the push transport (`FirebaseService`),
  the member-facing inbox endpoints, and the staff-facing broadcast endpoint.

Everything that used to call `mailService.sendXxx(...)` directly from
`BookingsService`, `ScheduleService`, and `InvoicesService` now calls a typed
`notificationsService.notifyXxx(...)` method instead. Those three modules no
longer depend on `MailService` at all (except `InvoicesService.resend`, see §5)
— they depend on `NotificationsModule`, which depends on `CommunicationModule`.

```
BookingsModule ──┐
ScheduleModule ──┼──▶ NotificationsModule ──▶ CommunicationModule (MailService)
InvoicesModule ──┘         │
                            └──▶ FirebaseService (push)
                            └──▶ NotificationLog (in-app inbox + audit)
```

---

## 2. The core dispatcher

`NotificationsService.notify()` (private) is the one place every member-facing
event goes through:

```ts
private async notify(params: {
  memberId: string; gymId: string; type: string; title: string; body: string;
  data?: Record<string, unknown>;
  email?: (member: Member) => Promise<void>;
}): Promise<void>
```

What it does, in order:

1. Loads the `Member` row itself — callers only ever pass a `member_id`, never a
   preloaded relation. This matters: it's why `InvoicesService.createForSubscription`
   can fire a notification even when the `MemberSubscription` it just built has no
   `member` relation loaded — `sub.member_id` is always present.
2. If an `email` thunk was passed, calls it and catches failures — `email_status`
   on the log row becomes `sent` or `failed`, but a failure never throws.
3. If the member has an `fcm_token`, sends a push via `FirebaseService` — same
   independent best-effort contract, `push_status` records the outcome. A
   `token_invalid` result (Firebase says the token is dead) clears
   `Member.fcm_token` so a stale token is never retried again.
4. Writes **one** `NotificationLog` row regardless of what happened on either
   channel. This row is simultaneously the member's in-app notification feed
   item and the delivery audit trail — `email_status` and `push_status` live on
   the same row, so the inbox never shows two entries for one event.

Email and push are genuinely independent: a dead mailbox doesn't stop the push,
a missing device token doesn't stop the email, and neither stops the log write
that makes the event show up in the member's in-app feed.

---

## 3. `NotificationLog` — one entity, two jobs

```
id, gym_id, member_id, type, title, body, data (jsonb),
email_status (skipped|sent|failed), push_status (skipped|sent|failed),
is_read, read_at, created_at
```

- `type` is a free-form string key (`waitlist_promoted`, `slot_disabled`,
  `invoice_ready`, `booking_reminder`, `announcement`) — no enum, so a new event
  type never needs a migration.
- `data` is the deep-link payload the app needs to route a tap on the
  notification (e.g. `{ booking_id, slot_id }` for a reminder).
- `email_status` / `push_status` default to `skipped` — a channel that was never
  attempted (no email thunk passed, or no `fcm_token` on the member) stays
  `skipped`, distinct from `failed`.
- `is_read` / `read_at` exist purely for the inbox — nothing else in the system
  reads them.

This is a rewrite of the entity, not an extension: the old shape (`channel` enum
+ single `status`, one row per channel) never had any code writing to it, so
there was no data to migrate.

---

## 4. Every trigger, and what it sends

| Event | Where it fires | Email | Push | Notes |
|---|---|---|---|---|
| Waitlist promoted | `BookingsService.cancel()` | ✅ | ✅ | Unchanged UX, now also push+logged |
| Class/slot disabled | `ScheduleService.disableSlot()` | ✅ | ✅ | Fires for every confirmed/waitlisted member on that slot |
| Invoice ready | `InvoicesService.createForSubscription()` | ✅ | ✅ | **New** — invoices used to be silent until someone hit resend |
| Invoice resent | `InvoicesService.resend()` | ✅ (throws on failure) | ✅ | See §5 — different failure contract |
| Booking reminder | `NotificationsService` cron, 15-min tick | ✅ | ✅ | **New** — the spec's Must-Have "automated booking reminders" |
| Staff announcement | `POST /communication/broadcast` | ✅ | ✅ | **New** — the spec's "In-App Email Composer" / "Push Notification Manager" |

Two things that deliberately stay email-only and outside this system: member/
staff **invites** (the account doesn't exist yet — no `fcm_token`, no inbox to
put anything in) and **OTP codes** (security-sensitive, push isn't an
appropriate channel). `staff.service.ts` and `members.service.ts` still call
`MailService` directly for those.

---

## 5. The one place that bypasses `notify()`: `InvoicesService.resend()`

`resend()` is an explicit staff action — "send this invoice again" — and staff
need to know if it failed (currently a `500` if the mailbox rejects). `notify()`
is best-effort by design (never throws on a channel failure), which is the
opposite contract. So `resend()` still calls `mailService.sendInvoiceEmail(...)`
directly and lets a failure propagate, then — only after the email is confirmed
sent — calls `notificationsService.logInvoiceResent(...)`, a narrower method
that writes the log row (`email_status: sent`, already known) and attempts push,
without re-sending the email. This is the only two-tier dispatch in the module;
every other trigger uses the single all-in-one `notify()`.

---

## 6. Automated booking reminders

```ts
@Cron('*/15 * * * *')
async sendBookingReminders()
```

Every 15 minutes, finds `CONFIRMED` bookings on `ENABLED` slots where
`starts_at` is within the next **2 hours** and `reminder_sent_at IS NULL`, sends
the notification, and stamps `reminder_sent_at`. Two design choices worth
knowing:

- **Condition-based, not a narrow time window.** The query is
  `starts_at <= now+2h AND starts_at > now AND reminder_sent_at IS NULL` — if a
  tick is missed (deploy, restart), the next tick still catches every booking
  that should have been reminded and wasn't. Same pattern as the existing
  past-due and grace-period crons.
- **`Booking.reminder_sent_at` is owned by `NotificationsModule`**, not
  `BookingsModule` — the same "who owns which column" split that already exists
  for `Slot.booking_count` (owned by `BookingsModule` even though `Slot` lives in
  `ClassScheduleModule`).

`BOOKING_REMINDER_HOURS = 2` is a single fixed constant — no per-gym
configuration, since nothing has asked for it yet.

---

## 7. Push notifications (Firebase Cloud Messaging)

`FirebaseService` wraps the Firebase Admin SDK (`firebase-admin/app` +
`firebase-admin/messaging`, the modular v12+ API — the old `admin.messaging()`
namespace API is gone in the installed version).

- **Boots best-effort.** Reads `FIREBASE_SERVICE_ACCOUNT_PATH` from env; if
  unset, falls back to a hardcoded dev/testing key path
  (`src/common/utils/farmsdrop-7b12e-firebase-adminsdk-fbsvc-0b388d95c0.json`,
  dropped in for local testing). If neither exists, logs a warning once at boot
  and push stays disabled for the process lifetime — **the app still starts**,
  and every notification still succeeds via email + the in-app log.
- **`send()` never throws.** A bad token, an uninitialized app, a network
  error — all become `'failed'`, never an exception. The one thing it does
  distinguish is `'token_invalid'` (Firebase's
  `messaging/registration-token-not-registered`), which tells `notify()` to
  clear that member's `fcm_token` so a permanently-dead token stops being
  retried on every future event.
- **The real credential is gitignored.** `.gitignore` has
  `*firebase-adminsdk*.json` — this is a live service-account private key and
  must never be committed. Production should set
  `FIREBASE_SERVICE_ACCOUNT_PATH` to point at its own real credentials file
  outside the repo (or the deploy pipeline should place one at the fallback
  path) — the file dropped into `src/common/utils/` is explicitly for local
  testing.

---

## 8. Member: the in-app notification inbox

`GET /notifications`, `GET /notifications/unread-count`,
`PATCH /notifications/:id/read`, `PATCH /notifications/read-all` — all standard
inbox operations reading/writing `NotificationLog` scoped to
`member_id = <the authenticated member>`. Nothing staff-facing exists to browse
this data (no admin audit UI) — not asked for, easy to add later since the log
already carries everything (`email_status`/`push_status` per event).

Device-token registration is the other half of "why push works at all":
`POST /notifications/device-token` (member app calls this once it has an FCM
token from the device, typically right after login) and
`DELETE /notifications/device-token` (call on logout, so a shared/reset device
doesn't keep receiving another member's pushes). Without this endpoint,
`Member.fcm_token` — a column that already existed in the schema — would never
get populated and push could never fire for anyone.

---

## 9. Staff: announcement broadcast

`POST /communication/broadcast` (org_admin / gym_manager — same role pairing as
`disableSlot`, front desk excluded since this is a bulk communication action).
Body: `{ gym_id, member_ids?, title, body }`.

- Resolves the target audience from `MemberGymAccess` (`is_active: true`) —
  every member currently attached to that gym, or the subset of `member_ids`
  that are actually in that gym (an ID for a member at a different gym is
  silently dropped, not an error).
- Fans out through the exact same `notify()` dispatcher every system-triggered
  event uses (`Promise.allSettled`, so one member's dead mailbox doesn't stop
  the other 200 from being notified).
- Returns `{ message, targeted, notified }` — `targeted` is the audience size,
  `notified` is how many `notify()` calls didn't throw (email/push failures
  inside `notify()` don't count against this — only a hard failure, e.g. the
  member row vanishing mid-broadcast, would).

This is the backend half of the spec's "In-App Email Composer" and
"Push Notification Manager" — the admin panel's compose screen is just a form
posting to this one endpoint.

---

## 10. Design decisions worth remembering

- **One dispatcher, not one-function-per-channel.** Adding a new notification
  type is always: write the email template in `MailService`, write one
  `notifyXxx()` method in `NotificationsService` that calls `notify()` with a
  title/body/data and an email thunk. No new plumbing.
- **The `NotificationLog` row is the source of truth for "did this member get
  notified," not the delivery status.** A member with no `fcm_token` and a
  bounced email still gets a row — they'll see it if they open the app, which
  is what actually matters for "did we tell them."
- **Invites and OTPs stay outside this system on purpose** — pre-account and
  security-sensitive events don't belong in a best-effort, multi-channel,
  loggable pipeline.
- **Push is infrastructure, not a requirement.** No part of the system assumes
  Firebase is configured. This lets local dev, CI, and a droplet without
  credentials all boot and work identically minus the push channel.
