# Members Module Expansion — Implementation Overview

## What was built

Endpoints added to the existing `MembersModule` (which already had `POST register`, `POST invite`, `POST waiver`). The expansion covers member listing, profile viewing and self-editing, self-service account deletion, and membership status management (pause, cancel, reactivate).

---

## New Files

```
src/members/
  dto/update-member.dto.ts         ← { full_name?, phone?, photo_url? }  (member self-update)
  dto/update-member-status.dto.ts  ← { status, pause_start?, resume_date? }  (staff status change)
  members.service.ts               ← expanded with 5 new methods (incl. deleteAccount) + private resolveGymIds helper
  members.controller.ts            ← expanded with 6 new endpoints
  members.module.ts                ← now also imports Gym and MemberSubscription repositories
```

---

## Endpoints Summary

| Method | Path | Guard | Roles | What it does |
|---|---|---|---|---|
| POST | `/members/register` | Public | — | (existing) self-register |
| POST | `/members/invite` | StaffJwt | gym_manager, front_desk | (existing) staff invites member |
| POST | `/members/waiver` | MemberJwt | — | (existing) member signs waiver |
| GET | `/members` | StaffJwt | all staff | list members, role-scoped |
| GET | `/members/profile` | MemberJwt | — | member views own profile |
| GET | `/members/:id` | StaffJwt | all staff | staff views member profile |
| PATCH | `/members/profile` | MemberJwt | — | member updates own profile; JSON or multipart with a `photo` file (Cloudinary) |
| DELETE | `/members/profile` | MemberJwt | — | member self-deletes own account (soft delete) |
| PATCH | `/members/:id/status` | StaffJwt | org_admin, gym_manager | pause / cancel / reactivate (rejects `deleted`) |

---

## Access Rules

### GET /members — Role-scoped list

| Caller | Result |
|---|---|
| super_admin | All members on the platform |
| org_admin | Members with active access to any gym in their org |
| gym_manager / front_desk | Members with active access to their assigned gyms |

`org_admin` needs gym IDs for their org, which requires a `gymRepo` query (see below). `gym_manager` and `front_desk` already have `gym_ids` in their JWT.

### GET /members/profile — Member self-profile

Returns the authenticated member's own profile plus their active `MemberGymAccess` rows. Uses `MemberJwtGuard` — this route must be declared **before** `GET /members/:id` in the controller to avoid NestJS matching a literal string as a UUID param.

### GET /members/:id — Staff views member

Access check mirrors `findAll` scoping:
- `super_admin` → any member
- `org_admin` → member must have active access to a gym in their org
- `gym_manager` / `front_desk` → member must share an active gym with them

Returns the member profile plus their **full** `MemberGymAccess` history (all rows including revoked).

### PATCH /members/profile — Member self-update

Member can update `full_name`, `phone`, and `photo_url`. No staff involvement. Sensitive fields are stripped from the response. Also accepts `multipart/form-data` with an optional `photo` image file (≤2 MB) — uploaded to Cloudinary (`gym-saas/member-photos` folder), same pattern as the org logo upload on `PATCH /organizations/:id`. A file, if present, wins over any `photo_url` field sent in the same request.

(Renamed from `PATCH /members/me` to match `GET /members/profile` — both self-service profile routes now live under the same path segment.)

### DELETE /members/profile — Member self-deletes account

Soft delete, member-initiated only, no request body. `MembersService.deleteAccount()`:

1. Cancels every `active` / `paused` / `past_due` `MemberSubscription` the member has — same terminal `cancelled` status `SubscriptionsService.cancel()` produces, stopping billing/renewal.
2. Revokes every active `MemberGymAccess` row (`is_active: false`, `revoked_at` stamped) — locks class booking and gym-door entry immediately.
3. Clears `fcm_token` (no more push to a deleted account).
4. Sets `Member.status = deleted` and stamps `Member.deleted_at`. The row itself is **never deleted**.

What is deliberately **not** touched: `Invoice`, `Booking`, `Waiver`, `Attendance` — all financial/audit records stay exactly as they are, still pointing at the now-deleted `member_id`. This is the whole point of the feature: "delete my account" must not mean "erase the gym's billing/attendance history."

Calling it twice returns `400 Bad Request` ("Account is already deleted"). After deletion, `POST /auth/member/login` returns the same `401 Invalid credentials` a wrong password would — a deleted account isn't distinguishable from a nonexistent one at the login boundary. Re-registering the same email is blocked forever: `POST /members/register` and `POST /members/invite` both reject on any existing row for that email regardless of `status`.

### PATCH /members/:id/status — Staff updates member status

`org_admin` and `gym_manager` can change a member's status. Same gym-scoping access check as `findOne`.

**Status transitions:**

| Status | Behaviour |
|---|---|
| `paused` | Sets `status = paused`. Optionally sets `pause_start` and `resume_date`. |
| `active` | Sets `status = active`. Clears `pause_start` and `resume_date`. |
| `cancelled` | Sets `status = cancelled`. No date fields modified. |
| `expired` | Sets `status = expired`. For automated expiry flows (future cron). |
| `deleted` | **Rejected** — `400 Bad Request`. Account deletion is member-initiated only; use `DELETE /members/profile` instead. Deletion has side effects (cancelling subscriptions, revoking gym access) this endpoint isn't scoped to trigger. |

---

## Why MembersModule imports Gym entity directly

`org_admin` has no `gym_ids` in their JWT (they have org-wide authority, not gym-specific). To scope member results to their org, the service queries `gymRepo` for all gym IDs belonging to `user.org_id`, then filters `MemberGymAccess` by those IDs. Rather than importing `GymModule` (risking circular dependency), `Gym` is registered directly via `TypeOrmModule.forFeature([..., Gym])` — the same pattern used in `StaffModule`.

### `resolveGymIds` helper

```typescript
private async resolveGymIds(user: StaffJwtPayload): Promise<string[]> {
  if (user.role === StaffRole.ORG_ADMIN) {
    const gyms = await this.gymRepo.find({ where: { organization_id: user.org_id! }, select: { id: true } });
    return gyms.map((g) => g.id);
  }
  return user.gym_ids; // gym_manager / front_desk — already in JWT
}
```

Used in `findAll`, `findOne`, and `updateStatus` — three call sites justify the helper.

---

## Security notes

- **No sensitive fields in responses**: `MEMBER_SAFE_SELECT` selects only `id`, `email`, `full_name`, `phone`, `photo_url`, `status`, `pause_start`, `resume_date`, `created_at`. `updateProfile` and `updateStatus` destructure off `password_hash`, `reset_token`, `reset_token_expires_at`, `invite_token`, `invite_expires_at`, `fcm_token` before returning.
- **Members cannot change their own status *directly***: `PATCH /members/:id/status` uses `StaffJwtGuard` — only staff can pause or cancel a membership. The one member-initiated status change is `deleted`, and only through the dedicated `DELETE /members/profile` endpoint (which also handles the subscription/gym-access side effects that a bare status flip wouldn't) — `PATCH /members/:id/status` explicitly rejects `status: deleted` even from staff, so there is exactly one path into that state.
- **Cross-gym access blocked**: gym_manager cannot list or view members from gyms they're not assigned to. The `resolveGymIds` helper ensures the gym_ids fence holds across all three management endpoints.
- **Route ordering matters**: `GET /members/profile`, `PATCH /members/profile`, and `DELETE /members/profile` are declared before `GET /members/:id` and `PATCH /members/:id/status` in the controller. NestJS matches routes top-to-bottom; if `:id` came first, a literal path segment would be captured as a UUID param and fail `ParseUUIDPipe`.
