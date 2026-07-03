# Organization & Gym Module — Implementation Overview

## What was built

Two complete CRUD modules: `OrganizationModule` and `GymModule`. Together they give platform admins and gym owners the ability to manage the top two levels of the tenant hierarchy through the API.

---

## Tenant Hierarchy Recap

```
Organization  ← root tenant (owned by super_admin / managed by org_admin)
  └── Gym     ← operational branch (managed by org_admin / gym_manager)
        ├── Staff
        └── Members
```

---

## OrganizationModule

### Files
```
src/organization/
  dto/create-organization.dto.ts   ← name (required), logo_url, currency
  dto/update-organization.dto.ts   ← all fields optional
  organization.service.ts          ← CRUD logic + access enforcement
  organization.controller.ts       ← 5 HTTP endpoints
  organization.module.ts           ← wires service + controller
```

### Access Rules

| Action | Who |
|---|---|
| Create | `super_admin` only |
| List all | `super_admin` only |
| Get one | `super_admin` (any org) OR `org_admin` (own org only) |
| Update | `super_admin` (any org) OR `org_admin` (own org only) |
| Delete | `super_admin` only — destructive, never org_admin |

**How "own org" is enforced:** `org_admin` has `org_id` baked into their JWT at login. The service compares `user.org_id === id` before allowing read/write. No extra DB query — zero overhead.

### Fields (Organization entity)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | auto-generated |
| `name` | string | required |
| `logo_url` | string \| null | optional |
| `currency` | string | defaults to `GBP` |
| `stripe_customer_id` | string \| null | set by Stripe webhook, not exposed in DTO |
| `created_at` | Date | auto-set |

---

## GymModule

### Files
```
src/gym/
  dto/create-gym.dto.ts   ← organization_id (optional), name + tax config fields
  dto/update-gym.dto.ts   ← all fields optional, no organization_id
  gym.service.ts          ← CRUD logic + role-scoped list + access guard
  gym.controller.ts       ← 5 HTTP endpoints
  gym.module.ts           ← wires service + controller
```

### Access Rules

| Action | Who |
|---|---|
| Create | `super_admin` (must send `organization_id`) OR `org_admin` (uses own org_id from JWT) |
| List | All staff — but results are scoped: super_admin sees all, org_admin sees own org's gyms, gym_manager/front_desk see only their assigned gyms |
| Get one | All staff — service checks: super_admin passes, org_admin must own the org, gym_manager/front_desk must have the gym_id in their JWT |
| Update | `super_admin`, `org_admin` (same org), `gym_manager` (assigned gym only) |
| Delete | `super_admin` or `org_admin` (same org only) — gym_manager cannot delete |

**How gym assignment is checked:** `gym_ids` is an array baked into the JWT at login from `StaffGymAccess` rows. The service calls `user.gym_ids.includes(gym.id)` — no DB query per request.

### Fields (Gym entity)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | auto-generated |
| `organization_id` | UUID | FK to organizations |
| `name` | string | required |
| `address` | string \| null | optional |
| `timezone` | string \| null | e.g. `Europe/London` |
| `tax_mode` | enum | `vat` / `sales_tax` / `none` — defaults to `vat` |
| `default_tax_rate` | decimal | 0–100, defaults to 20.00 |
| `tax_inclusive` | boolean | defaults to true |
| `vat_number` | string \| null | UK VAT registration number |
| `stripe_account_id` | string \| null | set by Stripe Connect, not in DTO |
| `gocardless_merchant_id` | string \| null | set by GoCardless, not in DTO |
| `created_at` | Date | auto-set |

---

## Authorization Pattern (shared by both modules)

```
HTTP request
  → StaffJwtGuard   validates JWT, attaches user to request
  → RolesGuard      checks @Roles(...) decorator
      super_admin   → always passes (bypasses role check entirely)
      other roles   → must be in the allowed list
  → Controller      passes user payload to service
  → Service         additional ownership check (org_id / gym_ids comparison)
```

This two-layer approach means:
- The guard blocks roles that should never touch the endpoint.
- The service blocks a valid role from accessing another tenant's data.

---

## What is NOT in scope here (YAGNI)

- Pagination — no query params needed yet; gym counts per org are small.
- Search/filter — not requested; add when the frontend needs it.
- `stripe_*` / `gocardless_*` fields — set by payment webhooks, not by these APIs.
- Soft delete — `remove()` is a hard delete; add `deleted_at` if recycling is ever needed.
