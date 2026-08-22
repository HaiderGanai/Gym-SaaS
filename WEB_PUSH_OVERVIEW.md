# Web Push — How It Works Inside

Browser push notifications for the member web app, riding the same
`NotificationsService.notify()` dispatcher every other member-facing event
already goes through — email and mobile push (Firebase) don't change; web
push is a third, independent channel bolted onto the same pipeline. See
`WEB_PUSH_NOTIFICATIONS_PLAN.md` for the original explainer/decision
write-up; this doc covers what actually got built. Endpoint request/response
bodies live in `WEB_PUSH_POSTMAN_ENDPOINTS.md`.

Base URL prefix: `/api/v1`.

---

## 1. What changed, at a glance

```
BookingsModule ──┐
ScheduleModule ──┼──▶ NotificationsModule ──▶ CommunicationModule (MailService)
InvoicesModule ──┤         │
SubscriptionsModule ┘      ├──▶ FirebaseService   (mobile push, FCM)
                            ├──▶ WebPushService    (browser push, VAPID)  ← new
                            └──▶ NotificationLog (in-app inbox + audit)
```

- **`WebPushService`** (`src/notifications/web-push.service.ts`) — new, mirrors
  `FirebaseService` exactly: boots off env vars, silently disables itself if
  they're missing (never crashes the app), exposes one `send()` that never
  throws.
- **`Member.web_push_subscription`** (new `jsonb` column) — the browser's
  `PushSubscription` object (`{ endpoint, keys: { p256dh, auth } }`), stored
  the same way `Member.fcm_token` stores the mobile token. One subscription
  per member, same one-device-per-member model the FCM token already uses.
- **`SubscriptionsModule` now depends on `NotificationsModule`** — it didn't
  before. Needed because pause/resume/past_due now notify (see §3).

---

## 2. How a push actually reaches a browser

1. Frontend registers a service worker, asks the browser for notification
   permission, and calls `PushManager.subscribe()` with our VAPID public key.
   The browser hands back a subscription object tied to *that specific
   browser* — the `endpoint` is a URL owned by the browser vendor (Google's
   push service for Chrome/Edge, Mozilla's for Firefox), not us.
2. Frontend `POST`s that object to `/notifications/web-push-subscription`
   (member-authenticated) — see §5 of the Postman doc. It's stored as-is.
3. When `NotificationsService.notify()` (or the manual test-push endpoint)
   fires, `WebPushService.send()` calls `webpush.sendNotification(subscription,
   payload)` — the `web-push` npm package encrypts the payload and POSTs it to
   whichever vendor endpoint is embedded in the subscription. We never talk to
   the browser directly; the vendor relays it.
4. The browser's service worker receives a `push` event and shows the OS
   notification — this part is 100% frontend, no backend involvement.

A dead subscription (member revoked permission, uninstalled, cleared
storage) makes the vendor's push service respond `404`/`410`.
`WebPushService.send()` treats that as `subscription_invalid`, and
`NotificationsService` clears `Member.web_push_subscription` right then —
same self-healing pattern the FCM token already has for
`messaging/registration-token-not-registered`.

---

## 3. Every event that now carries a web push

`dispatchPush()` (private, in `NotificationsService`) is the one place both
push channels are attempted — every caller of `notify()`/`logDelivered()`
gets web push for free, no per-event code needed. One `push_status` on the
`NotificationLog` row covers both channels: `sent` if *either* delivered,
`failed` if at least one was attempted and neither delivered, `skipped` if
the member has no device registered on any channel.

| Event | Trigger | Existed before this work? |
|---|---|---|
| Booking confirmed | `BookingsService.book()`, capacity claim succeeds | **New** |
| Booking waitlisted | `BookingsService.book()`, class full | **New** |
| Booking cancelled (staff) | `PATCH /bookings/:id/staff-cancel` | **New** — member self-cancel (`PATCH /bookings/:id/cancel`) deliberately does **not** notify, they just did it themselves |
| Waitlist promoted | A confirmed cancellation frees a spot | Existed (email+FCM) |
| Class reminder | 15-min cron, 2h before `starts_at` | Existed (email+FCM) |
| Gym cancels class | `PATCH /schedule/slots/:id/disable` | Existed (email+FCM) |
| Staff announcement | `POST /communication/broadcast` | Existed (email+FCM) |
| Invoice ready | Subscription created/renewed | Existed (email+FCM) |
| Subscription past_due | Daily 8am cron, recurring sub lapsed | **New** — wasn't even emailed before |
| Subscription paused | `PATCH /subscriptions/:id/pause` (staff or member self-service) | **New** |
| Subscription resumed | `PATCH /subscriptions/:id/resume` (staff or member self-service) | **New** |

The six new triggers have **no email template** — they only call `notify()`
without an `email` callback, so `email_status` reports `skipped` on those
rows by design (not a bug). Add a `MailService.sendXxx()` method and pass it
in if these ever need an email leg too; the plumbing (`notify()`) already
supports it, nothing else changes.

---

## 4. Generating VAPID keys and handing them to the frontend

VAPID keys are a public/private keypair that identifies *this backend* to
the browser vendors' push services. Generate once, reuse forever — they're
not rotated per-deploy or per-environment the way a session secret might be
(rotating them invalidates every subscription every browser holds, forcing
everyone to re-subscribe).

**Step 1 — generate the keypair** (already done for this dev environment,
repeat only for a new environment, e.g. production):

```bash
npx web-push generate-vapid-keys
```

This prints a `Public Key` and `Private Key` (both URL-safe base64 strings,
no separate encoding step needed).

**Step 2 — put them in the backend's env** (`.env`, or your deploy platform's
secret store for production):

```
VAPID_PUBLIC_KEY=<the Public Key from step 1>
VAPID_PRIVATE_KEY=<the Private Key from step 1>
VAPID_SUBJECT=mailto:<a real contact address for your team>
```

`VAPID_SUBJECT` isn't a secret — it's a contact the push services can reach
if your server is misbehaving (e.g. sending too much). A `mailto:` address
or an `https://` URL both work; `mailto:` is simpler.

If any of the three are missing, `WebPushService` logs a warning at boot and
silently disables itself — email and in-app notifications keep working,
nothing crashes (same fallback behavior `FirebaseService` already has for a
missing Firebase key).

**Step 3 — give the frontend the public key only.** Never send the private
key anywhere near the browser — it's what lets our server *authenticate* to
the push services; if it leaks, anyone can spam every subscribed browser as
us. The frontend needs just the public key, passed into
`PushManager.subscribe({ applicationServerKey: <public key> })`. Two ways to
hand it over:

- Give it to them directly (Slack/1Password/whatever the team already uses
  for sharing config) — it's the same value as `VAPID_PUBLIC_KEY`, safe to
  paste anywhere since it's not a secret.
- Or fetch it from the backend at runtime so it's never hardcoded in the
  frontend build: `WebPushService.getPublicKey()` already exists for this —
  wire a tiny public `GET` endpoint to it if the frontend team would rather
  pull it than be handed it. Not built here since it wasn't asked for — a
  one-line controller method (`return { public_key: this.webPush.getPublicKey() }`)
  whenever it's wanted.

**Step 4 — production.** Generate a **separate** keypair for production
(don't reuse the dev one) via the same `npx web-push generate-vapid-keys`
command, and set the three env vars on the production server. That's the
entire production setup — no database migration needed beyond what
`synchronize` already handles in non-production, and for a production DB
where `synchronize` is off:

```sql
ALTER TABLE members ADD COLUMN web_push_subscription jsonb;
```

---

## 5. Manual testing without a real browser

`POST /notifications/test-push` (MemberJwt) exists purely so this can be
verified without wiring up a frontend or triggering a real booking/cancel
flow — see the Postman doc for the full request/response shape. It calls the
same `dispatchPush()` every real event uses, against whatever channels
(`fcm_token`, `web_push_subscription`) the logged-in member currently has
registered. It deliberately does **not** write a `NotificationLog` row —
it's a diagnostic, not a real event, so it never pollutes the member's actual
in-app inbox.
