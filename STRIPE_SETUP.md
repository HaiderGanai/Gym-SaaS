# Stripe Payment Setup

Webhook endpoint in this app: `POST /api/v1/platform/billing/webhook`
The webhook is the source of truth — the DB only updates when Stripe's event reaches the backend. If payments show `null` in the DB, the webhook didn't arrive.

---

## 1. Local dev (localhost)

One-time setup (already done on this laptop):

1. Install the Stripe CLI: https://stripe.com/docs/stripe-cli
2. Log in (opens browser, pairs CLI with your Stripe account):
   ```bash
   stripe login
   ```

Every time you develop (each reboot / new session):

1. Start the backend as usual:
   ```bash
   npm run start:dev
   ```
2. In a **second terminal**, start the webhook relay and leave it running:
   ```bash
   stripe listen --forward-to localhost:3000/api/v1/platform/billing/webhook
   ```
3. It prints: `Ready! Your webhook signing secret is whsec_...`
   That value must equal `STRIPE_WEBHOOK_SECRET` in `.env`. It stays the same for ~90 days, so normally no action. If it changed, update `.env` and restart the backend.
4. Test a payment with card `4242 4242 4242 4242` (any future expiry, any CVC).
   You should see events scroll in the `stripe listen` terminal and the DB update.

If a payment already happened while the relay was down: Stripe Dashboard → Workbench → Events → find `checkout.session.completed` → **Resend** (with `stripe listen` running).

---

## 2. Local network (frontend on 192.168.18.18)

Nothing extra for Stripe. The webhook does **not** go through the LAN IP:

- Frontend → backend: `http://192.168.18.18:3000/api/v1` (already working)
- Stripe → backend: still via `stripe listen` on this laptop, forwarding to `localhost:3000`

Stripe's servers can never reach `192.168.18.18` (private address), so the relay in section 1 is required exactly the same. Just keep `stripe listen` running whenever the frontend dev is testing payments.

Only detail to check: the Checkout `success_url` / `cancel_url` (built from `FRONTEND_URL` in `.env`) should point where the frontend actually runs, e.g. `http://192.168.18.18:3001`, so the redirect after payment lands on his machine.

---

## 3. Production server (future)

One-time setup — **no CLI, no relay process, nothing to restart**:

1. Deploy the backend on a public HTTPS domain, e.g. `https://api.yourdomain.com`.
2. Stripe Dashboard → **Developers → Webhooks → Add endpoint**:
   - URL: `https://api.yourdomain.com/api/v1/platform/billing/webhook`
   - Events to send:
     - `checkout.session.completed`
     - `invoice.paid`
     - `invoice.payment_failed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
3. Open the new endpoint in the dashboard and copy its **signing secret** (`whsec_...` — a *different* one from the CLI's). Set it as `STRIPE_WEBHOOK_SECRET` in the production env.
4. Switch `STRIPE_SECRET_KEY` from `sk_test_...` to the live `sk_live_...` key (and create your platform plans again in live mode — test-mode Stripe Products/Prices don't exist in live mode).

### Does it survive server restarts?

**Yes — set it once, forget it.** The webhook is configuration stored on Stripe's side, not a process on your server. When your server restarts, Stripe keeps POSTing to the same URL. If the server is down when an event fires, Stripe automatically retries for up to ~3 days, so events sent during a restart are not lost.

The only things that would ever require touching it again:
- Your domain/URL changes → edit the endpoint URL in the dashboard.
- You rotate the signing secret → update `STRIPE_WEBHOOK_SECRET` env.

---

## Quick reference

| Environment | Who delivers events | Runs when | `STRIPE_WEBHOOK_SECRET` |
|---|---|---|---|
| localhost | `stripe listen` relay | Every dev session (manual) | From `stripe listen` output |
| LAN (192.168.18.18) | Same `stripe listen` relay | Every dev session (manual) | Same as localhost |
| Production | Stripe directly, over HTTPS | Always (Stripe-side config) | From dashboard endpoint |
