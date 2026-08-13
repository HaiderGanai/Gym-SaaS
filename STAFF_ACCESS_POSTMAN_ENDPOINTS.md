# Staff Invites & Gym Access — Postman Testing Guide

Full lifecycle: org_admin invites a gym manager → manager accepts & logs in → admin grants/revokes branch access → manager invites front desk staff → front desk accepts & logs in → manager grants them branch access.

Base URL: `http://localhost:3000/api/v1`

Two rules to keep in mind the whole way through:

1. **Invites carry no branch.** A freshly accepted gym_manager / front_desk logs in with `gym_ids: []` in their JWT and can see nothing. Branch access is a separate step (`POST /staff/:id/gym-access`).
2. **`gym_ids` are baked into the JWT at login.** After any grant or revoke, the affected staff member must **log in again** to get a token that reflects the change. Their old token keeps working with the old gym list until it expires.

Dev seed: org_admin `owner@test.com` / `Test1234!`, gym `2e82ea95-3c50-48bf-93a1-251b7b807cd3`.

---

## 1. Org admin logs in

**POST** `/auth/staff/login`
```json
{
  "email": "owner@test.com",
  "password": "Test1234!"
}
```
→ save `access_token` as `{{admin_token}}`.

---

## 2. Org admin invites a gym manager

**POST** `/staff/invite` — `Bearer {{admin_token}}` (org_admin or gym_manager)
```json
{
  "email": "manager@testgym.com",
  "full_name": "Mandy Manager",
  "role": "gym_manager"
}
```
```json
{ "message": "Invitation sent to manager@testgym.com" }
```
An email goes out with an invite link containing a 64-char `token` (expires in **72 h**). In dev, grab it from the email or straight from the DB:
```sql
SELECT invite_token FROM staff_users WHERE email = 'manager@testgym.com';
```

Roles you can invite: `org_admin`, `gym_manager`, `front_desk`. (Nobody can invite a `super_admin`.)

---

## 3. Manager accepts the invite

**POST** `/auth/staff/invite/accept` — public
```json
{
  "token": "<64-char token from the email>",
  "password": "Manager1234!"
}
```
Sets the real password and activates the account (`is_active: true`).

---

## 4. Manager logs in

**POST** `/auth/staff/login`
```json
{
  "email": "manager@testgym.com",
  "password": "Manager1234!"
}
```
→ save as `{{manager_token}}`.

**Decode the JWT** — you'll see:
```json
{ "role": "gym_manager", "org_id": "…", "gym_ids": [] }
```
Empty `gym_ids` is expected: no branch was assigned yet. `GET /gyms` with this token returns `[]`.

You'll also need the manager's staff **id** for the access calls — `GET /staff` with `{{admin_token}}` and copy the `id` for manager@testgym.com → `{{manager_id}}`.

---

## 5. Org admin grants branch access to the manager

**POST** `/staff/{{manager_id}}/gym-access` — `Bearer {{admin_token}}` (org_admin, or gym_manager for their own gyms)
```json
{
  "gym_id": "{{gym_id}}"
}
```
Creates an active `StaffGymAccess` row. Repeat with another `gym_id` to give the manager multiple branches.

**Now re-login as the manager** (repeat step 4) — the fresh JWT contains:
```json
{ "gym_ids": ["2e82ea95-3c50-48bf-93a1-251b7b807cd3"] }
```
`GET /gyms` with the new `{{manager_token}}` now returns the branch.

---

## 6. Org admin revokes branch access

**DELETE** `/staff/{{manager_id}}/gym-access/{{gym_id}}` — `Bearer {{admin_token}}` (org_admin, or gym_manager for their own gyms)

Sets the junction row `is_active: false` + `revoked_at` (history is kept, the row is not deleted). The manager's *current* token still lists the gym until it expires or they re-login — that's the JWT-baking trade-off.

Re-grant with step 5 whenever needed (the service re-activates the existing row).

---

## 7. Manager invites a front desk staffer

**POST** `/staff/invite` — `Bearer {{manager_token}}`
```json
{
  "email": "desk@testgym.com",
  "full_name": "Fred Frontdesk",
  "role": "front_desk"
}
```
Same flow as before: token email → accept → login.

**POST** `/auth/staff/invite/accept` — public
```json
{
  "token": "<token from desk@testgym.com's email>",
  "password": "FrontDesk1234!"
}
```

**POST** `/auth/staff/login`
```json
{
  "email": "desk@testgym.com",
  "password": "FrontDesk1234!"
}
```
→ `{{desk_token}}`, again with `gym_ids: []`. Get their id via `GET /staff` → `{{desk_id}}`.

---

## 8. Manager grants the front desk access to their branch

**POST** `/staff/{{desk_id}}/gym-access` — `Bearer {{manager_token}}`
```json
{
  "gym_id": "{{gym_id}}"
}
```
A gym_manager can only grant access to gyms **they themselves have access to** — granting a gym outside `{{manager_token}}`'s `gym_ids` returns 403. The org_admin token can grant any gym in the org.

Front desk re-logs in → their JWT now carries the branch, and member/subscription/invoice endpoints scoped to that gym start working.

To take the branch away again, the manager (or org_admin) runs:

**DELETE** `/staff/{{desk_id}}/gym-access/{{gym_id}}` — `Bearer {{manager_token}}`

Same own-gyms rule as granting: a gym_manager revoking at a gym outside their `gym_ids` gets 403.

---

## Related admin endpoints

| Method | URL | Auth | Purpose |
|---|---|---|---|
| GET | `/staff` | any staff | List staff (scoped: org_admin = own org, gym_manager/front_desk = colleagues at shared gyms) |
| GET | `/staff/:id` | any staff | Profile + gym access history |
| PATCH | `/staff/:id` | org_admin | `{ "role": "gym_manager" }` or `{ "is_active": false }` (deactivate = can't log in at all; cannot promote to super_admin) |

---

## Error reference

| Status | Endpoint | Cause |
|---|---|---|
| 409 `A staff account with this email already exists` | POST `/staff/invite` | duplicate email |
| 404 `Invite token not found` | invite/accept | wrong/used token (tokens are cleared after accept) |
| 400 `Invite token has expired` | invite/accept | older than 72 h — send a new invite |
| 401 | `/auth/staff/login` | wrong password, or account not yet activated (invite not accepted) |
| 403 | POST `/staff/:id/gym-access` | gym_manager granting a gym they don't have access to |
| 403 `Gym managers can only revoke access to their own assigned gyms` | DELETE gym-access | gym_manager revoking outside their own gyms |
| 403 `Your organization subscription is not active…` | everything | org's platform subscription lapsed — unrelated to gym access |

## Quick reference — the whole flow

| # | Method | URL | Token | Body |
|---|---|---|---|---|
| 1 | POST | `/auth/staff/login` | — | admin credentials |
| 2 | POST | `/staff/invite` | admin | `email, full_name, role: "gym_manager"` |
| 3 | POST | `/auth/staff/invite/accept` | — | `token, password` |
| 4 | POST | `/auth/staff/login` | — | manager credentials (`gym_ids: []`) |
| 5 | POST | `/staff/:id/gym-access` | admin | `{ "gym_id": "…" }` → manager re-logs in |
| 6 | DELETE | `/staff/:id/gym-access/:gymId` | admin or manager | — (manager: own gyms only) |
| 7 | POST | `/staff/invite` | manager | `email, full_name, role: "front_desk"` |
| 8 | POST | `/auth/staff/invite/accept` + login | — | front desk sets password, logs in |
| 9 | POST | `/staff/:id/gym-access` | manager | `{ "gym_id": "…" }` (own gyms only) → desk re-logs in |
