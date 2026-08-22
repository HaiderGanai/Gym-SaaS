# Web Push — Postman Endpoints

Base URL: `http://localhost:3000/api/v1` (dev). See `WEB_PUSH_OVERVIEW.md` for
the design/architecture. Every other web-push notification (booking
confirmed, class reminder, gym cancels class, announcement, etc.) fires
**automatically** from its own flow — there's no endpoint to call for those
directly; the only thing you manually trigger here is registering a
subscription and firing a test push through it.

---

## 1. `POST /notifications/web-push-subscription`

Registers (or overwrites) the logged-in member's browser push subscription.
Call this from the frontend right after `PushManager.subscribe()` succeeds —
the request body is that subscription object's `.toJSON()` output, unmodified.

**Auth:** MemberJwt

**Body:**
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/<vendor-assigned-id>",
  "keys": {
    "p256dh": "<base64 public key from the browser subscription>",
    "auth": "<base64 auth secret from the browser subscription>"
  }
}
```

**Example request:**
```
POST /api/v1/notifications/web-push-subscription
Authorization: Bearer {{member_token}}
Content-Type: application/json

{
  "endpoint": "https://fcm.googleapis.com/fcm/send/fake-endpoint-123",
  "keys": { "p256dh": "BFakeKeyValue1234567890abcdefgh", "auth": "fakeauthsecret" }
}
```

**Response `201`:**
```json
{ "message": "Web push subscription registered" }
```

**Errors:**
- `400` — `endpoint` isn't a URL, or `keys.p256dh`/`keys.auth` missing.
- `401` — missing/invalid member JWT.

---

## 2. `DELETE /notifications/web-push-subscription`

Clears the logged-in member's browser subscription — call on logout, same as
`DELETE /notifications/device-token` for the mobile FCM token.

**Auth:** MemberJwt

**Body:** none.

**Example request:**
```
DELETE /api/v1/notifications/web-push-subscription
Authorization: Bearer {{member_token}}
```

**Response `200`:**
```json
{ "message": "Web push subscription cleared" }
```

---

## 3. `POST /notifications/test-push`

Fires one canned notification through every channel the logged-in member has
registered (mobile FCM, browser web push, or both) — this is how you verify
VAPID keys / subscription validity / FCM token validity without needing to
book a class or wait for a cron. Does **not** write to the member's in-app
notification inbox (`GET /notifications`) — it's a diagnostic, not a real
event.

**Auth:** MemberJwt

**Body (all fields optional):**
| Field | Type | Notes |
|---|---|---|
| `title` | string | Defaults to `"Test notification"`. Max 150 chars. |
| `body` | string | Defaults to `"If you can see this, push is wired up correctly."` |

**Example request — canned message:**
```
POST /api/v1/notifications/test-push
Authorization: Bearer {{member_token}}
Content-Type: application/json

{}
```

**Example request — custom message:**
```
POST /api/v1/notifications/test-push
Authorization: Bearer {{member_token}}
Content-Type: application/json

{ "title": "Hello", "body": "Testing web push from Postman" }
```

**Response `201` — delivered on at least one channel:**
```json
{
  "push_status": "sent",
  "channels_attempted": { "fcm": false, "web_push": true }
}
```

**Response `201` — registered but delivery failed on every attempted channel**
(dead subscription, expired token, or VAPID/Firebase not configured):
```json
{
  "push_status": "failed",
  "channels_attempted": { "fcm": false, "web_push": true }
}
```

**Errors:**
- `404` — member has no device registered on either channel:
  ```json
  {
    "message": "No device registered — call POST /notifications/device-token (mobile) or POST /notifications/web-push-subscription (browser) first",
    "error": "Not Found",
    "statusCode": 404
  }
  ```
- `401` — missing/invalid member JWT.

---

## Reference: what the automatic pushes look like

Not directly callable, but useful for the frontend to know the `type`/`data`
shapes it'll receive in a `push` event or via `GET /notifications`:

| `type` | `data` payload |
|---|---|
| `booking_confirmed` | `{ booking_id, slot_id, activity_name, starts_at }` |
| `booking_waitlisted` | `{ booking_id, slot_id, activity_name, starts_at, waitlist_position }` |
| `booking_cancelled` | `{ activity_name, starts_at, cancelled_by: "staff" }` |
| `waitlist_promoted` | `{ activity_name, starts_at }` |
| `booking_reminder` | `{ booking_id, slot_id }` |
| `slot_disabled` | `{ activity_name, starts_at }` |
| `announcement` | *(no `data` — `title`/`body` are the whole message)* |
| `invoice_ready` | `{ invoice_id }` |
| `subscription_past_due` | `{ plan_name }` |
| `subscription_paused` | `{ plan_name }` |
| `subscription_resumed` | `{ plan_name }` |
