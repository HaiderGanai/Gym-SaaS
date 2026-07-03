# Staff Module Expansion — Implementation Overview

## What was built

Five new endpoints added to the existing `StaffModule` (which already had `POST /staff/invite`). The expansion covers staff listing, profile viewing, role/status updates, and full gym access lifecycle management.

---

## New Files

```
src/staff/
  dto/update-staff.dto.ts         ← { role?, is_active? }
  dto/grant-gym-access.dto.ts     ← { gym_id: string }
  staff.service.ts                ← expanded with 5 new methods
  staff.controller.ts             ← expanded with 5 new endpoints
  staff.module.ts                 ← now also imports Gym repository
```

---

## Endpoints Summary

| Method | Path | Roles Allowed | What it does |
|---|---|---|---|
| POST | `/staff/invite` | org_admin, gym_manager | (existing) send email invite |
| GET | `/staff` | all | list staff, scoped by caller's role |
| GET | `/staff/:id` | all | profile + gym access list |
| PATCH | `/staff/:id` | org_admin | change role or deactivate/reactivate |
| POST | `/staff/:id/gym-access` | org_admin, gym_manager | assign staff to a gym |
| DELETE | `/staff/:id/gym-access/:gymId` | org_admin | revoke staff access from a gym |

---

## Access Rules

### GET /staff — Role-scoped list

| Caller | Result |
|---|---|
| super_admin | All staff across all organizations |
| org_admin | All staff in their organization |
| gym_manager / front_desk | Staff who share at least one gym with them (via `StaffGymAccess` rows) |

No extra DB call for super_admin/org_admin — filtered by org_id from JWT.
For gym_manager/front_desk: one join-style query on `StaffGymAccess` to find colleague IDs, then one `find` by those IDs.

### GET /staff/:id — Profile with gym access

Returns the staff profile plus their full `gym_access` array (all rows, including revoked — let the client filter `is_active`).

| Caller | Access |
|---|---|
| super_admin | Any staff |
| org_admin | Staff in their org |
| gym_manager / front_desk | Staff who share an active gym with them OR self |
| Any role | Own profile (self) |

### PATCH /staff/:id — Role & active status

Only `super_admin` and `org_admin` can update staff. Guards:
- `org_admin` cannot set role to `super_admin`
- `org_admin` cannot change their own role (prevents self-escalation/lockout)
- `super_admin` has no such restrictions

Fields: `{ role?, is_active? }` — send only what you want to change.

Response strips all sensitive columns (`password_hash`, `reset_token`, `invite_token`, etc.) before returning.

### POST /staff/:id/gym-access — Grant access

Creates or reactivates a `StaffGymAccess` row.

| Caller | Who they can grant | Which gym |
|---|---|---|
| super_admin | Any staff | Any gym |
| org_admin | Staff in their org | Any gym in their org |
| gym_manager | Staff in their org (via staff's org check) | Only their own assigned gyms |

If the row already exists and is **active** → `409 Conflict`.
If the row exists but is **revoked** → reactivates it (sets `is_active = true`, clears `revoked_at`, updates `granted_by`).

**Important:** Granting access does NOT update the staff member's JWT. They must log out and log back in for `gym_ids` in the token to reflect the new assignment.

### DELETE /staff/:id/gym-access/:gymId — Revoke access

Sets `is_active = false` and stamps `revoked_at`. The row is preserved (soft revoke). Only `super_admin` and `org_admin` can revoke.

Same JWT caveat: the revoked staff's existing token still carries the old `gym_ids` until it expires or they re-login.

---

## Why StaffModule imports Gym entity directly

The service needs to validate that the gym exists and belongs to the right organization when granting access. Rather than creating a circular dependency by importing GymModule (which might later import StaffModule), the `Gym` TypeORM repository is registered directly in `StaffModule.imports` via `TypeOrmModule.forFeature([..., Gym])`. This is a standard NestJS pattern — `autoLoadEntities: true` in the root module means the entity is still registered globally once, and the feature registration just makes its repository injectable in this module.

---

## Security notes

- **No sensitive fields in responses**: list and profile queries use a `SAFE_SELECT` constant that only selects `id`, `email`, `role`, `is_active`, `organization_id`, `created_at`. `update()` destructures off sensitive columns before returning.
- **JWT is not invalidated on deactivation**: setting `is_active = false` blocks future logins but existing tokens remain valid until expiry (7d default). For immediate revocation, implement token blacklisting (future concern).
- **Role escalation blocked**: `org_admin` cannot assign `super_admin` role. `super_admin` is not listed as a settable role in the update endpoint's `@Roles` guard either, but the service-level check is the actual enforcement.
