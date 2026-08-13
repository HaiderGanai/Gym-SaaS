# Postman Endpoints — Auth & Registration Testing

Base URL: `http://localhost:3000/api/v1`

Seed data (from `node seed.js`):
- **gym_id**: `2e82ea95-3c50-48bf-93a1-251b7b807cd3`
- **org_id**: `6c6ec47d-939c-4a64-aff6-52a3efe7a877`
- **super_admin**: `super@platform.com` / `Super1234!`
- **org_admin**: `owner@test.com` / `Test1234!`

---

## Flow A — Member Self-Registration & Login

### 1. Register a Member (self-serve, no invite needed)

```
POST /members/register
Content-Type: application/json
```

```json
{
  "email": "jane.doe@example.com",
  "full_name": "Jane Doe",
  "password": "Member1234!",
  "phone": "+447700900000",
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3"
}
```

`phone` is optional.

**Response** `201`:
```json
{
  "message": "Account created successfully. You can now log in.",
  "member_id": "<uuid>"
}
```

---

### 2. Member Login

```
POST /auth/member/login
Content-Type: application/json
```

```json
{
  "email": "jane.doe@example.com",
  "password": "Member1234!"
}
```

**Response** `201`:
```json
{ "access_token": "<jwt>", "member_id": "<uuid>", "organization": { "...": "branding block, see CLAUDE.md" } }
```

`member_id` is the member's own ID (same value as the JWT's `sub` claim).
JWT payload: `sub`, `email`, `gym_ids`, `primary_gym_id`, `status`.

---

### 3. Member Signs Waiver

Requires member JWT from step 2.

```
POST /members/waiver
Content-Type: application/json
Authorization: Bearer <member_access_token>
```

```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "signature_url": "https://storage.example.com/signatures/jane-sig.png",
  "document_url": "https://storage.example.com/waivers/gym-waiver-v1.pdf"
}
```

`document_url` is optional. `signature_url` is the URL of the signature image captured on the frontend. IP address is captured server-side.

**Response** `201`:
```json
{
  "message": "Waiver signed successfully",
  "waiver_id": "<uuid>"
}
```

Submitting a second waiver for the same gym returns `409 Conflict`.

---

## Flow B — Staff Login

### 4. Staff Login (org_admin — seed account)

```
POST /auth/staff/login
Content-Type: application/json
```

```json
{
  "email": "owner@test.com",
  "password": "Test1234!"
}
```

**Response** `201`:
```json
{ "access_token": "<jwt>" }
```

JWT payload: `sub`, `email`, `role` (`org_admin`), `org_id`, `gym_ids`.

---

### 5. Super Admin Login

```
POST /auth/staff/login
Content-Type: application/json
```

```json
{
  "email": "super@platform.com",
  "password": "Super1234!"
}
```

JWT `role` = `super_admin`, `org_id` = `null`, `gym_ids` = `[]`.

---

## Flow C — Staff Invite Flow

Requires org_admin or gym_manager JWT.

### 6. Invite a Staff Member

```
POST /staff/invite
Content-Type: application/json
Authorization: Bearer <org_admin_token>
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

Invite expires in **72 hours**. If email fails, get token from DB:
```sql
SELECT invite_token FROM staff_users WHERE email = 'manager@test.com';
```

---

### 7. Staff Accepts Invite & Sets Password

```
POST /auth/staff/invite/accept
Content-Type: application/json
```

```json
{
  "token": "<invite_token>",
  "password": "Manager1234!"
}
```

**Response** `201`: `{ "access_token": "<jwt>" }` — usable immediately.

---

### 8. Staff Login as Invited Manager

```
POST /auth/staff/login
Content-Type: application/json
```

```json
{
  "email": "manager@test.com",
  "password": "Manager1234!"
}
```

JWT `role` = `gym_manager`. `gym_ids` will be `[]` — gym access assignment not yet implemented.

---

## Flow D — Member Invite Flow (staff sends invite link to member)

Requires gym_manager or front_desk JWT.

### 9. Staff Invites a Member

```
POST /members/invite
Content-Type: application/json
Authorization: Bearer <gym_manager_or_front_desk_token>
```

```json
{
  "email": "new.member@example.com",
  "full_name": "Sam Smith",
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "phone": "+447700900001"
}
```

`phone` is optional.

**Response** `201`:
```json
{ "message": "Invitation sent to new.member@example.com" }
```

Member receives an email with a link to `{FRONTEND_URL}/member/accept-invite?token=<token>`.
Invite expires in **72 hours**. Get token from DB if needed:
```sql
SELECT invite_token FROM members WHERE email = 'new.member@example.com';
```

---

### 10. Member Accepts Invite & Sets Password

```
POST /auth/member/invite/accept
Content-Type: application/json
```

```json
{
  "token": "<invite_token>",
  "password": "NewMember1234!"
}
```

**Response** `201`:
```json
{ "access_token": "<jwt>", "member_id": "<uuid>", "organization": { "...": "branding block, see CLAUDE.md" } }
```

Account is active immediately. JWT contains `gym_ids` populated from the invite. `member_id` is the member's own ID (same value as the JWT's `sub` claim).

---

### 11. Member Signs Waiver (post-invite)

Same as step 3 — use the JWT from step 10.

```
POST /members/waiver
Authorization: Bearer <member_access_token>
```

```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "signature_url": "https://storage.example.com/signatures/sam-sig.png"
}
```

---

## Flow E — Staff Password Reset (OTP)

### 12. Staff Forgot Password → Request OTP

```
POST /auth/staff/forgot-password
Content-Type: application/json
```

```json
{ "email": "owner@test.com" }
```

Always returns the same message (prevents email enumeration):
```json
{ "message": "If that email is registered, an OTP has been sent." }
```

A **6-digit OTP** is emailed. Expires in **10 minutes**. Get it from DB if email isn't configured:
```sql
SELECT reset_token FROM staff_users WHERE email = 'owner@test.com';
```

---

### 13. Staff Reset Password → Submit OTP

```
POST /auth/staff/reset-password
Content-Type: application/json
```

```json
{
  "email": "owner@test.com",
  "otp": "482916",
  "password": "NewPassword1234!"
}
```

**Response** `201`:
```json
{ "message": "Password reset successfully. You can now log in." }
```

---

## Flow F — Staff Change Password (OTP, authenticated)

### 14. Request OTP for Change Password

Requires a valid staff JWT. No body needed — OTP is sent to the logged-in user's email.

```
POST /auth/staff/change-password/send-otp
Authorization: Bearer <staff_access_token>
```

**Response** `201`:
```json
{ "message": "OTP sent to your registered email." }
```

---

### 15. Staff Change Password → Submit OTP

```
POST /auth/staff/change-password
Content-Type: application/json
Authorization: Bearer <staff_access_token>
```

```json
{
  "otp": "391047",
  "new_password": "NewPassword1234!"
}
```

**Response** `201`:
```json
{ "message": "Password changed successfully." }
```

Works for all staff roles: `super_admin`, `org_admin`, `gym_manager`, `front_desk`.

---

## Flow G — Member Password Reset (OTP)

### 16. Member Forgot Password → Request OTP

```
POST /auth/member/forgot-password
Content-Type: application/json
```

```json
{ "email": "jane.doe@example.com" }
```

```json
{ "message": "If that email is registered, an OTP has been sent." }
```

Get OTP from DB if needed:
```sql
SELECT reset_token FROM members WHERE email = 'jane.doe@example.com';
```

---

### 17. Member Reset Password → Submit OTP

```
POST /auth/member/reset-password
Content-Type: application/json
```

```json
{
  "email": "jane.doe@example.com",
  "otp": "748201",
  "password": "NewMember1234!"
}
```

**Response** `201`:
```json
{ "message": "Password reset successfully. You can now log in." }
```

---

## Flow H — Member Change Password (OTP, authenticated)

### 18. Request OTP for Change Password

```
POST /auth/member/change-password/send-otp
Authorization: Bearer <member_access_token>
```

**Response** `201`:
```json
{ "message": "OTP sent to your registered email." }
```

---

### 19. Member Change Password → Submit OTP

```
POST /auth/member/change-password
Content-Type: application/json
Authorization: Bearer <member_access_token>
```

```json
{
  "otp": "203847",
  "new_password": "NewMember1234!"
}
```

**Response** `201`:
```json
{ "message": "Password changed successfully." }
```

---

## Error Reference

| Scenario | Status | Body |
|---|---|---|
| Wrong password | 401 | `{ "message": "Invalid credentials" }` |
| Email not found | 401 | `{ "message": "Invalid credentials" }` |
| Duplicate email | 409 | `{ "message": "... already exists" }` |
| Waiver already signed for this gym | 409 | `{ "message": "Waiver already signed for this gym" }` |
| Invalid or expired OTP | 400 | `{ "message": "Invalid or expired OTP" }` |
| Missing/invalid body field | 400 | `{ "message": ["<validation error>"] }` |
| Expired invite token | 400 | `{ "message": "Invite token has expired" }` |
| Invalid invite token | 404 | `{ "message": "Invite token not found" }` |
| Missing/invalid Bearer token | 401 | `{ "message": "Unauthorized" }` |
| Wrong role for endpoint | 403 | `{ "message": "Forbidden resource" }` |
| super_admin hits org-scoped endpoint | 403 | `{ "message": "Super admin must specify an org context..." }` |
