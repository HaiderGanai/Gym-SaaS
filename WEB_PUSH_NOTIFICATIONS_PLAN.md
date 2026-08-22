# Web Push Notifications — Explainer + Implementation Plan

## 1. What web push actually is

"Web push" is browser-native push notifications — the OS-level notification popup a website can show even when the tab isn't open, on desktop Chrome/Edge/Firefox and (with limits) mobile Safari/Chrome. Three parts:

1. **Service worker** (frontend) — a background script the browser keeps running. It listens for a `push` event and calls `self.registration.showNotification(title, options)`.
2. **Push subscription** (frontend) — the browser's `PushManager.subscribe()` call returns a `{ endpoint, keys: { p256dh, auth } }` object. `endpoint` is a URL owned by the browser vendor (Google's push service for Chrome, Mozilla's for Firefox, Apple's for Safari); it's how the browser vendor routes a message back to that specific browser instance. The frontend sends this object to our backend to store.
3. **VAPID keys** (backend) — a public/private keypair that identifies *our server* to the browser vendors' push services, so they'll accept and relay a message on our behalf. Generated once, reused forever.

To send a notification, the backend calls `webpush.sendNotification(subscription, JSON.stringify(payload))`. The `web-push` npm package does exactly that: encrypts the payload per the Web Push protocol (RFC 8030) and POSTs it to whichever vendor endpoint is embedded in the subscription. It does **not** provide a service worker, does **not** manage subscriptions, and does **not** talk to Firebase — it's a thin, provider-agnostic HTTP client for one spec.

## 2. Does this duplicate what we already have?

We already ship push — but only to the **mobile app**, via Firebase Cloud Messaging (`src/notifications/firebase.service.ts`). `Member.fcm_token` is one column, one token per member.

Two honest options for the web app:

- **(A) `web-push` package, as the frontend dev suggested.** Independent of Firebase. No Google project dependency for browser clients, smaller frontend bundle (no Firebase JS SDK). Needs its own VAPID keypair, its own subscription storage, its own send call — new code on both ends.
- **(B) Reuse Firebase.** The Firebase JS SDK also supports web push (`getToken()` with a VAPID key configured in the Firebase console) and hands back an FCM token — the *same shape* our `FirebaseService.send()` already sends to. Zero new backend package; the existing `notify()` dispatcher already calls it. Only gap: `Member.fcm_token` is a single column, so a member with both the app and a browser tab open would need two token slots instead of one (a `device_tokens` join table, or a second column).

(B) is the smaller diff on the backend — `FirebaseService` doesn't care whether a token came from a phone or a browser, it's the same `messaging().send()` call. (A) is what was actually asked for, and is the right call if the frontend wants no Firebase dependency in the browser at all. This doc follows the ask and plans around **(A) `web-push`**, since that's a frontend-owned tradeoff — flagging (B) here so the decision is made on purpose, not by default.

## 3. Where web push is required — every trigger point

All of these are **member-facing** (the member web app). None of this touches the staff dashboard. Every trigger below either already exists as an email+FCM event (just needs a third channel bolted on) or doesn't exist as a notification at all yet (net-new).

| # | Event | Status today | Fires from | Criteria | Recipient | Payload | Timing |
|---|---|---|---|---|---|---|---|
| 1 | Booking confirmed | **New** | `BookingsService.create()` (`POST /bookings`) | Capacity claim succeeds → `status = confirmed` | The booking member | `{ type: 'booking_confirmed', booking_id, slot_id, activity_name, starts_at, gym_name }` | Immediate, same request |
| 2 | Booking waitlisted | **New** | Same method, capacity full branch | Class full → `status = waitlisted` | The booking member | `{ type: 'booking_waitlisted', slot_id, activity_name, starts_at, waitlist_position }` | Immediate |
| 3 | Waitlist promoted | Exists (email+FCM), `notifications.service.ts:117` `notifyWaitlistPromoted`, called from `bookings.service.ts:189` | A confirmed booking is cancelled → lowest `waitlist_position` promoted | The promoted member | `{ activity_name, starts_at }` | Immediate, on the cancellation that frees the spot |
| 4 | Booking cancelled by staff | **New** | `PATCH /bookings/:id/staff-cancel` | Staff cancels a member's confirmed/waitlisted booking (cutoff-free override) | The affected member | `{ activity_name, starts_at, cancelled_by: 'staff' }` | Immediate |
| 5 | Booking cancelled by member | **New, optional** | `PATCH /bookings/:id/cancel` | Member cancels their own booking | The member | same shape, `cancelled_by: 'self'` | Immediate — low value (they just did it), skip unless product wants a confirmation toast-style push |
| 6 | Class about to start (reminder) | Exists (email+FCM), `notifications.service.ts:163` `sendBookingReminders` | 15-min cron | Confirmed booking, slot enabled, `starts_at` within `BOOKING_REMINDER_HOURS = 2` and not yet reminded (`reminder_sent_at IS NULL`) | Every confirmed booking's member | `{ activity_name, starts_at, booking_id, slot_id }` | **2 hours before class start**, `notifications.service.ts:19` |
| 7 | Gym cancels the class | Exists (email+FCM), `notifications.service.ts:130` `notifySlotDisabled`, called from `schedule.service.ts:267` | `PATCH /schedule/slots/:id/disable` | Staff disables a slot | Every confirmed + waitlisted member on that slot | `{ activity_name, starts_at }` | Immediate |
| 8 | Staff announcement | Exists (email+FCM), `notifications.service.ts:187` `broadcastAnnouncement` | `POST /communication/broadcast` | Staff-authored, targets all active members of a gym or a picked subset | Targeted members | `{ title, body }` — free text, staff-composed | Immediate |
| 9 | Invoice ready | Exists (email+FCM), `notifications.service.ts:141` `notifyInvoiceReady`, called from `invoices.service.ts:58` | Subscription created/renewed | New invoice auto-generated | The subscription's member | `{ invoice_id }` | Immediate |
| 10 | Subscription past_due | **New, not even emailed today** | `subscriptions.service.ts:267` daily 8am cron | Recurring sub's period lapsed unrenewed | The member | `{ subscription_id, plan_name }` | Daily 8am, same tick as the status flip |
| 11 | Subscription paused/resumed by staff | **New, not wired at all** | `PATCH /subscriptions/:id/pause`\|`/resume` | Staff pauses/resumes a member's sub | The member | `{ subscription_id, action: 'paused'\|'resumed' }` | Immediate — lower priority, add if requested |

Rows 1, 2, 4, 10, 11 don't exist as notifications *at all* right now (not even email) — they're gaps independent of web push. Rows 3, 6, 7, 8, 9 already flow through `NotificationsService.notify()`; adding web push there is one new branch in one function, not five.

## 4. Implementation plan

**Backend**

1. `npm install web-push`; generate a VAPID keypair once (`web-push generate-vapid-keys`), store as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (a `mailto:` contact) env vars.
2. New `WebPushService` (sibling to `FirebaseService`, same shape: a `send(subscription, title, body, data)` that never throws, returns `sent | failed | subscription_invalid` — a `410 Gone`/`404` response from the vendor endpoint means the subscription is dead, same handling `FirebaseService` already does for `messaging/registration-token-not-registered`).
3. Store subscriptions: add a `web_push_subscription jsonb` column on `Member` (nullable) — mirrors `fcm_token`, one subscription per member (matches the existing one-device-per-member model; revisit only if multi-device support is actually requested).
4. Two endpoints mirroring the existing device-token pair: `POST /notifications/web-push-subscription` (body = the `PushSubscription` object from the browser) and `DELETE /notifications/web-push-subscription`.
5. `NotificationsService.notify()` gets a third best-effort branch: if `member.web_push_subscription`, call `webPushService.send(...)`, same failure isolation as the email/FCM branches, same single `NotificationLog` row (no new column needed — `push_status` already covers "a push channel was attempted"; if per-channel delivery ever needs distinguishing, split then).
6. Wire the net-new triggers (rows 1, 2, 4, 10, 11 above) into their respective services the same way `notifyWaitlistPromoted` is wired into `bookings.service.ts` — one `notificationsService.notifyXxx(...)` call at the point the state change happens, `.catch()`'d so a notification failure never fails the request.

**Frontend** (context for reviewing their PR, not this repo's work)

1. Service worker registered at app boot, handling `push` → `showNotification`.
2. On login (or first visit), `Notification.requestPermission()` → `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })` → POST the resulting subscription to the new backend endpoint.
3. On logout, DELETE the subscription (mirrors clearing `fcm_token` on mobile logout).

**Order of work**: steps 1–5 (plumbing) unblock nothing on their own — do them alongside the *first* real trigger (pick one of rows 1/4/7, since 7 already exists for email/FCM and is the cheapest way to prove the new channel end-to-end), then add the remaining rows one at a time.
