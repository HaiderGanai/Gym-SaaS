# Postman Endpoints — Members Module (Expanded)

Base URL: `http://localhost:3000/api/v1`

## Get tokens first

```
POST /auth/staff/login
{ "email": "super@platform.com", "password": "Super1234!" }   → super_admin_token

POST /auth/staff/login
{ "email": "owner@test.com", "password": "Test1234!" }         → org_admin_token

POST /auth/member/login
{ "email": "<member-email>", "password": "<password>" }        → member_token
```

Seed IDs:
- **org_id**: `6c6ec47d-939c-4a64-aff6-52a3efe7a877`
- **gym_id**: `2e82ea95-3c50-48bf-93a1-251b7b807cd3`

---

## 1. Register Member (existing)

```
POST /members/register
Content-Type: application/json
```
```json
{
  "email": "alice@test.com",
  "full_name": "Alice Smith",
  "phone": "+1234567890",
  "password": "Alice1234!",
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3"
}
```

**Response** `201`:
```json
{
  "message": "Account created successfully. You can now log in.",
  "member_id": "<uuid>"
}
```

---

## 2. Invite Member (existing)

```
POST /members/invite
Authorization: Bearer <org_admin_token>   (or gym_manager / front_desk token)
Content-Type: application/json
```
```json
{
  "email": "bob@test.com",
  "full_name": "Bob Jones",
  "phone": "+9876543210",
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3"
}
```

**Response** `201`:
```json
{ "message": "Invitation sent to bob@test.com" }
```

Get invite token from DB if email isn't configured:
```sql
SELECT invite_token FROM members WHERE email = 'bob@test.com';
```

Accept invite via:
```
POST /auth/member/invite/accept
{ "token": "<invite_token>", "password": "Bob1234!" }
```

---

## 3. Sign Waiver (existing)

```
POST /members/waiver
Authorization: Bearer <member_token>
Content-Type: application/json
```
```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "signature_url": "https://storage.example.com/sig/alice.png",
  "document_url": "https://storage.example.com/docs/waiver-v1.pdf"
}
```

**Response** `201`:
```json
{ "message": "Waiver signed successfully", "waiver_id": "<uuid>" }
```

---

## 4. List Members (staff)

```
GET /members
Authorization: Bearer <org_admin_token>
```

Results are scoped by caller role:
- `super_admin` → all members on the platform
- `org_admin` → members with access to any gym in their org
- `gym_manager` / `front_desk` → members in their assigned gyms

**Response** `200`:
```json
[
  {
    "id": "<uuid>",
    "email": "alice@test.com",
    "full_name": "Alice Smith",
    "phone": "+1234567890",
    "photo_url": null,
    "status": "active",
    "pause_start": null,
    "resume_date": null,
    "created_at": "2026-07-02T..."
  }
]
```

No `password_hash`, `reset_token`, `invite_token`, or `fcm_token` in the response.

---

## 5. Member Self-Profile

```
GET /members/profile
Authorization: Bearer <member_token>
```

**Response** `200`:
```json
{
  "id": "<uuid>",
  "email": "alice@test.com",
  "full_name": "Alice Smith",
  "phone": "+1234567890",
  "photo_url": null,
  "status": "active",
  "pause_start": null,
  "resume_date": null,
  "created_at": "2026-07-02T...",
  "gym_access": [
    {
      "id": "<uuid>",
      "member_id": "<uuid>",
      "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
      "is_primary": true,
      "is_active": true,
      "granted_by": null,
      "granted_at": "2026-07-02T..."
    }
  ]
}
```

---

## 6. Get Member Profile (staff)

```
GET /members/:id
Authorization: Bearer <org_admin_token>
```

Replace `:id` with the member's UUID.

**Response** `200`:
```json
{
  "id": "<uuid>",
  "email": "alice@test.com",
  "full_name": "Alice Smith",
  "phone": "+1234567890",
  "photo_url": null,
  "status": "active",
  "pause_start": null,
  "resume_date": null,
  "created_at": "2026-07-02T...",
  "gym_access": [
    {
      "id": "<uuid>",
      "member_id": "<uuid>",
      "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
      "is_primary": true,
      "is_active": true,
      "granted_by": null,
      "granted_at": "2026-07-02T..."
    }
  ]
}
```

**Errors:**
- `403` — staff caller has no gym overlap with this member
- `404` — member not found

---

## 7. Member Self-Update Profile

```
PATCH /members/profile
Authorization: Bearer <member_token>
Content-Type: application/json
```

Send only the fields you want to change.

**Update name:**
```json
{ "full_name": "Alice M. Smith" }
```

**Update phone:**
```json
{ "phone": "+447911123456" }
```

**Update photo (JSON, direct URL):**
```json
{ "photo_url": "https://storage.example.com/photos/alice.jpg" }
```

**Update multiple:**
```json
{
  "full_name": "Alice M. Smith",
  "phone": "+447911123456",
  "photo_url": "https://storage.example.com/photos/alice.jpg"
}
```

**Update photo (multipart, actual file upload):**
```
PATCH /members/profile
Authorization: Bearer <member_token>
Content-Type: multipart/form-data

full_name: Alice M. Smith      (optional text field)
phone: +447911123456           (optional text field)
photo: <file>                  (optional, image, ≤2 MB — uploaded to Cloudinary)
```
`photo_url` in the response is overwritten with the Cloudinary `secure_url`, regardless of any `photo_url` text field sent in the same request.

**Response** `200`: updated member object (no sensitive fields).

---

## 8. Member Self-Deletes Account

```
DELETE /members/profile
Authorization: Bearer <member_token>
```

No request body. Soft delete — cancels open subscriptions, revokes gym access, blocks future login. Invoices, bookings, waivers, and attendance history are untouched.

**Response** `200`:
```json
{ "message": "Account deleted" }
```

**Calling it again:**
```json
{ "message": "Account is already deleted", "error": "Bad Request", "statusCode": 400 }
```

**Logging in afterward** (`POST /auth/member/login`) returns the standard wrong-credentials response — a deleted account is indistinguishable from one that never existed:
```json
{ "message": "Invalid credentials", "error": "Unauthorized", "statusCode": 401 }
```

**Errors:**
- `401` — not authenticated
- `400` — account already deleted

---

## 9. Update Member Status (staff)

```
PATCH /members/:id/status
Authorization: Bearer <org_admin_token>
Content-Type: application/json
```

### Pause membership

```json
{
  "status": "paused",
  "pause_start": "2026-07-05",
  "resume_date": "2026-07-20"
}
```

### Cancel membership

```json
{ "status": "cancelled" }
```

### Reactivate membership

```json
{ "status": "active" }
```

Reactivating clears `pause_start` and `resume_date` automatically.

### Mark as expired

```json
{ "status": "expired" }
```

### Attempting `status: "deleted"` — rejected

```json
{ "status": "deleted" }
```
```json
{ "message": "Account deletion is member-initiated only — use DELETE /members/profile", "error": "Bad Request", "statusCode": 400 }
```
Staff cannot delete a member's account through this endpoint, even `super_admin` — use `DELETE /members/profile` (member-authenticated) instead.

**Response** `200`: updated member object (no sensitive fields):
```json
{
  "id": "<uuid>",
  "email": "alice@test.com",
  "full_name": "Alice Smith",
  "phone": "+1234567890",
  "photo_url": null,
  "status": "paused",
  "pause_start": "2026-07-05",
  "resume_date": "2026-07-20",
  "created_at": "2026-07-02T..."
}
```

**Errors:**
- `403` — gym_manager / org_admin targeting a member outside their gym/org scope
- `404` — member not found

---

## Complete Testing Flow

```
1. POST /members/register         → create alice@test.com, get member_id
2. POST /auth/member/login        → get member_token for alice
3. GET  /members/profile          → (as alice) view own profile + gym_access
4. PATCH /members/profile              → (as alice) update full_name or phone
5. GET  /members                  → (as org_admin) list all members in org
6. GET  /members/:member_id       → (as org_admin) view alice's profile
7. PATCH /members/:id/status      → (as org_admin) pause alice { status: "paused", pause_start: "2026-07-05", resume_date: "2026-07-20" }
8. GET  /members/:member_id       → (as org_admin) confirm status=paused with dates
9. PATCH /members/:id/status      → (as org_admin) reactivate alice { status: "active" }
10. GET  /members/:member_id      → (as org_admin) confirm status=active, dates cleared
11. DELETE /members/profile       → (as alice) delete own account
12. GET  /members/:member_id      → (as org_admin) confirm status=deleted, subscriptions cancelled, gym_access revoked
13. POST /auth/member/login       → (as alice) confirm 401 Invalid credentials
```

---

## Error Reference

| Scenario | Status | Body |
|---|---|---|
| JWT missing or invalid | 401 | `{ "message": "Unauthorized" }` |
| Role not allowed for endpoint | 403 | `{ "message": "Forbidden resource" }` |
| Cross-gym / cross-org access attempt | 403 | `{ "message": "Access denied" }` |
| Member not found | 404 | `{ "message": "Member not found" }` |
| Invalid UUID in path | 400 | `{ "message": "Validation failed (uuid is expected)" }` |
| Invalid status value | 400 | `{ "message": "status must be a valid enum value" }` |
| Invalid date format for pause_start / resume_date | 400 | `{ "message": "pause_start must be a valid ISO 8601 date string" }` |
| Staff attempts `status: "deleted"` via `PATCH /members/:id/status` | 400 | `{ "message": "Account deletion is member-initiated only — use DELETE /members/profile" }` |
| `DELETE /members/profile` on an already-deleted account | 400 | `{ "message": "Account is already deleted" }` |
| Login attempt on a deleted account | 401 | `{ "message": "Invalid credentials" }` |
