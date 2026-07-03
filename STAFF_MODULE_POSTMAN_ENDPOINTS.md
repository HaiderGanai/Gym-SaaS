# Postman Endpoints — Staff Module (Expanded)

Base URL: `http://localhost:3000/api/v1`

## Get tokens first

```
POST /auth/staff/login
{ "email": "super@platform.com", "password": "Super1234!" }   → super_admin_token

POST /auth/staff/login
{ "email": "owner@test.com", "password": "Test1234!" }         → org_admin_token
```

Seed IDs:
- **org_id**: `6c6ec47d-939c-4a64-aff6-52a3efe7a877`
- **gym_id**: `2e82ea95-3c50-48bf-93a1-251b7b807cd3`

---

## 1. Invite Staff (existing)

```
POST /staff/invite
Authorization: Bearer <org_admin_token>
Content-Type: application/json
```
```json
{
  "email": "manager@test.com",
  "full_name": "Alex Manager",
  "role": "gym_manager"
}
```
Valid roles: `org_admin` · `gym_manager` · `front_desk`

**Response** `201`:
```json
{ "message": "Invitation sent to manager@test.com" }
```

Get invite token from DB if email isn't configured:
```sql
SELECT invite_token FROM staff_users WHERE email = 'manager@test.com';
```

---

## 2. List Staff

```
GET /staff
Authorization: Bearer <any_staff_token>
```

Results are scoped by caller role:
- `super_admin` → all staff on the platform
- `org_admin` → staff in their organization
- `gym_manager` / `front_desk` → staff sharing their assigned gyms

**Response** `200`:
```json
[
  {
    "id": "<uuid>",
    "email": "owner@test.com",
    "role": "org_admin",
    "is_active": true,
    "organization_id": "6c6ec47d-939c-4a64-aff6-52a3efe7a877",
    "created_at": "2026-06-30T..."
  }
]
```

No `password_hash`, `reset_token`, or `invite_token` in the response.

---

## 3. Get Staff Profile

```
GET /staff/:id
Authorization: Bearer <any_staff_token>
```

Returns the profile plus their complete gym access history.

**Response** `200`:
```json
{
  "id": "<uuid>",
  "email": "manager@test.com",
  "role": "gym_manager",
  "is_active": true,
  "organization_id": "6c6ec47d-939c-4a64-aff6-52a3efe7a877",
  "created_at": "2026-06-30T...",
  "gym_access": [
    {
      "id": "<uuid>",
      "staff_id": "<staff-uuid>",
      "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
      "is_active": true,
      "granted_by": "<uuid>",
      "granted_at": "2026-07-01T...",
      "revoked_at": null
    }
  ]
}
```

**Errors:**
- `403` — caller has no access to this staff member
- `404` — staff not found

---

## 4. Update Staff (role / active status)

```
PATCH /staff/:id
Authorization: Bearer <super_admin_token>   ← any staff
              Bearer <org_admin_token>      ← own org only
Content-Type: application/json
```

Send only the fields you want to change.

**Change role:**
```json
{ "role": "gym_manager" }
```
Valid roles: `org_admin` · `gym_manager` · `front_desk`
`org_admin` cannot set role to `super_admin`.
`org_admin` cannot change their own role.

**Deactivate staff:**
```json
{ "is_active": false }
```

**Reactivate staff:**
```json
{ "is_active": true }
```

**Change role and deactivate in one request:**
```json
{
  "role": "front_desk",
  "is_active": false
}
```

**Response** `200`: updated staff object (no sensitive fields).

**Errors:**
- `403` — attempting to set `super_admin` role, changing own role, or accessing wrong org
- `404` — staff not found

---

## 5. Grant Gym Access

Assign a staff member to a gym branch. The `gym_ids` array in their JWT will reflect this only after their next login.

```
POST /staff/:id/gym-access
Authorization: Bearer <super_admin_token>     ← any staff, any gym
              Bearer <org_admin_token>        ← own org's staff + gyms
              Bearer <gym_manager_token>      ← any staff but only their own gym
Content-Type: application/json
```
```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3"
}
```

**Response** `201`:
```json
{
  "id": "<uuid>",
  "staff_id": "<uuid>",
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "is_active": true,
  "granted_by": "<caller-uuid>",
  "granted_at": "2026-07-01T...",
  "revoked_at": null
}
```

If access was previously revoked, it is reactivated (same row, `is_active` flipped back to `true`).

**Errors:**
- `409` — staff already has active access to this gym
- `403` — gym_manager trying to grant a gym they're not assigned to; org_admin granting outside their org
- `404` — staff or gym not found

---

## 6. Revoke Gym Access

Remove a staff member's assignment to a gym. The row is soft-deleted (`is_active = false`, `revoked_at` stamped). Their existing JWT still contains the gym_id until it expires.

```
DELETE /staff/:id/gym-access/:gymId
Authorization: Bearer <super_admin_token>   ← any staff, any gym
              Bearer <org_admin_token>      ← own org only
```

**Response** `200`:
```json
{ "message": "Gym access revoked successfully" }
```

**Errors:**
- `403` — gym_manager / front_desk attempting revoke; org_admin targeting another org's staff
- `404` — active gym access not found (either never existed, or already revoked)

---

## Complete Testing Flow (new staff setup)

```
1. POST /staff/invite          → send invite to manager@test.com (as org_admin)
2. POST /auth/staff/invite/accept  → { token, password } → get manager JWT
3. GET  /staff                 → list (as org_admin, see the new manager)
4. GET  /staff/:manager_id     → profile (gym_access will be empty)
5. POST /staff/:manager_id/gym-access  → { "gym_id": "<gym_id>" }  (as org_admin)
6. GET  /staff/:manager_id     → profile again (gym_access now shows the grant)
7. POST /auth/staff/login      → manager logs in again → JWT now includes gym_id
8. DELETE /staff/:manager_id/gym-access/:gym_id  → revoke (as org_admin)
9. GET  /staff/:manager_id     → gym_access shows is_active: false + revoked_at
```

---

## Error Reference

| Scenario | Status | Body |
|---|---|---|
| JWT missing or invalid | 401 | `{ "message": "Unauthorized" }` |
| Role not allowed for endpoint | 403 | `{ "message": "Forbidden resource" }` |
| Cross-org / cross-gym access attempt | 403 | `{ "message": "Access denied" }` |
| org_admin trying to set super_admin role | 403 | `{ "message": "Cannot assign super_admin role" }` |
| org_admin changing own role | 403 | `{ "message": "Cannot change your own role" }` |
| gym_manager granting a gym they're not in | 403 | `{ "message": "Gym managers can only grant access to their own assigned gyms" }` |
| Staff already has active gym access | 409 | `{ "message": "Staff already has active access to this gym" }` |
| Staff not found | 404 | `{ "message": "Staff not found" }` |
| Gym not found | 404 | `{ "message": "Gym not found" }` |
| Active gym access not found | 404 | `{ "message": "Active gym access not found" }` |
| Invalid UUID in path | 400 | `{ "message": "Validation failed (uuid is expected)" }` |
