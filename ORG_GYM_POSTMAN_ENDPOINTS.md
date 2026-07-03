# Postman Endpoints — Organization & Gym Modules

Base URL: `http://localhost:3000/api/v1`

Seed accounts (from `node seed.js`):
- **super_admin**: `super@platform.com` / `Super1234!`
- **org_admin**: `owner@test.com` / `Test1234!`
- **org_id**: `6c6ec47d-939c-4a64-aff6-52a3efe7a877`
- **gym_id**: `2e82ea95-3c50-48bf-93a1-251b7b807cd3`

Get tokens first:
```
POST /auth/staff/login   { "email": "super@platform.com", "password": "Super1234!" }
POST /auth/staff/login   { "email": "owner@test.com",     "password": "Test1234!"  }
```

---

## Organization Endpoints

### 1. Create Organization

```
POST /organizations
Authorization: Bearer <super_admin_token>
Content-Type: application/json
```
```json
{
  "name": "FitLife Group",
  "logo_url": "https://storage.example.com/logos/fitlife.png",
  "currency": "GBP"
}
```
`logo_url` and `currency` are optional. Currency defaults to `GBP`.

**Response** `201`:
```json
{
  "id": "<uuid>",
  "name": "FitLife Group",
  "logo_url": "https://storage.example.com/logos/fitlife.png",
  "currency": "GBP",
  "stripe_customer_id": null,
  "created_at": "2026-07-01T..."
}
```

---

### 2. List All Organizations

```
GET /organizations
Authorization: Bearer <super_admin_token>
```

**Response** `200`: array of organization objects, newest first.

---

### 3. Get Organization by ID

```
GET /organizations/:id
Authorization: Bearer <super_admin_token>   ← any org
              Bearer <org_admin_token>      ← own org only (403 otherwise)
```

**Response** `200`: single organization object.

**Errors:**
- `404` — organization not found
- `403` — org_admin trying to read a different org

---

### 4. Update Organization

```
PATCH /organizations/:id
Authorization: Bearer <super_admin_token>   ← any org
              Bearer <org_admin_token>      ← own org only
Content-Type: application/json
```
```json
{
  "name": "FitLife Group UK",
  "logo_url": "https://storage.example.com/logos/fitlife-v2.png",
  "currency": "USD"
}
```
All fields are optional — send only what you want to change.

**Response** `200`: updated organization object.

---

### 5. Delete Organization

```
DELETE /organizations/:id
Authorization: Bearer <super_admin_token>
```

**Response** `200`:
```json
{ "message": "Organization deleted successfully" }
```

**Errors:**
- `403` — non-super_admin attempting delete
- `404` — organization not found

---

## Gym Endpoints

### 6. Create Gym Branch

```
POST /gyms
Authorization: Bearer <super_admin_token>   ← must include organization_id
              Bearer <org_admin_token>      ← organization_id ignored; own org used
Content-Type: application/json
```

**As super_admin** (organization_id required):
```json
{
  "organization_id": "6c6ec47d-939c-4a64-aff6-52a3efe7a877",
  "name": "FitLife Canary Wharf",
  "address": "10 Canada Square, London E14 5AB",
  "timezone": "Europe/London",
  "tax_mode": "vat",
  "default_tax_rate": 20,
  "tax_inclusive": true,
  "vat_number": "GB123456789"
}
```

**As org_admin** (organization_id is optional and ignored):
```json
{
  "name": "FitLife Shoreditch",
  "address": "1 Old Street, London EC1V 9HL",
  "timezone": "Europe/London",
  "tax_mode": "vat",
  "default_tax_rate": 20,
  "tax_inclusive": true,
  "vat_number": "GB123456789"
}
```

Only `name` is required. All other fields are optional.

`tax_mode` values: `vat` | `sales_tax` | `none`

**Response** `201`: full gym object.

**Errors:**
- `403` — super_admin called without `organization_id`

---

### 7. List Gyms

```
GET /gyms
Authorization: Bearer <any_staff_token>
```

Results are automatically scoped by role:
- `super_admin` → all gyms across all organizations
- `org_admin` → gyms belonging to their organization
- `gym_manager` / `front_desk` → only gyms they are assigned to (from JWT `gym_ids`)

**Response** `200`: array of gym objects.

---

### 8. Get Gym by ID

```
GET /gyms/:id
Authorization: Bearer <any_staff_token>
```

**Response** `200`: single gym object.

**Errors:**
- `404` — gym not found
- `403` — caller has no access to this gym

---

### 9. Update Gym

```
PATCH /gyms/:id
Authorization: Bearer <super_admin_token>   ← any gym
              Bearer <org_admin_token>      ← own org's gyms only
              Bearer <gym_manager_token>    ← assigned gym only
Content-Type: application/json
```
```json
{
  "name": "FitLife Canary Wharf (Renovated)",
  "address": "10 Canada Square, Level 2, London E14 5AB",
  "timezone": "Europe/London",
  "tax_mode": "vat",
  "default_tax_rate": 20,
  "tax_inclusive": true,
  "vat_number": "GB123456789"
}
```
All fields are optional. `organization_id` cannot be changed after creation.

**Response** `200`: updated gym object.

---

### 10. Delete Gym

```
DELETE /gyms/:id
Authorization: Bearer <super_admin_token>   ← any gym
              Bearer <org_admin_token>      ← own org's gyms only
```

**Response** `200`:
```json
{ "message": "Gym deleted successfully" }
```

**Errors:**
- `403` — gym_manager / front_desk attempting delete, or org_admin on another org's gym
- `404` — gym not found

---

## Error Reference

| Scenario | Status | Body |
|---|---|---|
| JWT missing or invalid | 401 | `{ "message": "Unauthorized" }` |
| Role not allowed for endpoint | 403 | `{ "message": "Forbidden resource" }` |
| Accessing another org/gym's data | 403 | `{ "message": "Access denied" }` |
| super_admin creates gym without org_id | 403 | `{ "message": "Super admin must provide organization_id" }` |
| Organization not found | 404 | `{ "message": "Organization not found" }` |
| Gym not found | 404 | `{ "message": "Gym not found" }` |
| Invalid UUID format in path | 400 | `{ "message": "Validation failed (uuid is expected)" }` |
| Unknown field in request body | 400 | `{ "message": ["property X should not exist"] }` |
