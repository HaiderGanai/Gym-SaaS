# Gym SaaS — Project Reference

## 1. Project Overview

Multi-tenant gym management SaaS. A single deployment serves multiple fitness organizations (e.g., a gym chain). Each organization owns one or more gym branches. The platform handles staff management, member onboarding, class scheduling and bookings, membership subscriptions, invoicing with VAT, and AI-generated reports.

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (TypeScript) |
| Framework | NestJS 11 |
| Database | PostgreSQL |
| ORM | TypeORM (autoLoadEntities, synchronize off in production) |
| Auth | Passport.js + passport-jwt, @nestjs/jwt |
| Password hashing | bcrypt |
| Validation | class-validator + class-transformer |
| Scheduling | @nestjs/schedule (cron) |
| Config | @nestjs/config (env vars) |

### Required packages not yet in package.json
Run before starting the server:
```
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt class-validator class-transformer
npm install -D @types/passport-jwt @types/bcrypt
```

## 3. Tenant Hierarchy

```
Organization
  └── Gym (branch)
        ├── StaffUser  ←→ Gym via StaffGymAccess (many-to-many)
        └── Member     ←→ Gym via MemberGymAccess (many-to-many)
```

- **Organization** is the root tenant. Every StaffUser and Gym belongs to one Organization.
- **Gym** is the operational unit. Plans, slots, invoices, subscriptions, and reports all carry a `gym_id`.
- `org_owner` and `org_admin` roles bypass the StaffGymAccess junction at the guard level — they have org-wide access without needing junction rows.

## 4. Module Map

| Module | Responsibility |
|---|---|
| `OrganizationModule` | CRUD for organizations; org-level settings |
| `GymModule` | CRUD for gym branches; VAT number, branch details |
| `StaffModule` | Staff user management; invite flow; gym access grants |
| `AuthModule` | JWT issue and validation; login endpoints; invite acceptance |
| `MembersModule` | Member registration; gym access; waiver tracking |
| `PlansModule` | MembershipPlan CRUD; Discount codes per gym |
| `SubscriptionsModule` | Create/pause/cancel member subscriptions |
| `InvoicesModule` | Invoice generation; dunning queue; status transitions |
| `VatModule` | VAT calculation; VatPeriodSummary aggregation per gym |
| `ClassScheduleModule` | SlotTemplate (RRULE) management; Slot instance generation |
| `BookingsModule` | Booking creation; waitlist; QR check-in via signed JWT |
| `CommunicationModule` | Email + push notifications; NotificationLog |
| `ReportsModule` | AI daily report per gym (Gemini); monthly org-level report |

## 5. Build Status

### Complete
- [x] **All 18 entities** — finalized, do not modify
- [x] **AuthModule** — JWT login for staff and members, invite acceptance, guards, decorators
- [x] **StaffModule (partial)** — `POST /staff/invite` with email via Nodemailer; auth-support methods
- [x] **MembersModule (partial)** — `POST /members/register`; auth-support methods
- [x] **CommunicationModule (partial)** — `MailService` for Nodemailer (Gmail); exports to StaffModule

### Active Endpoints

| Method | Path | Guard | Who calls it |
|---|---|---|---|
| POST | `/auth/staff/login` | Public | Staff client |
| POST | `/auth/member/login` | Public | Member mobile app |
| POST | `/auth/staff/invite/accept` | Public | Staff (via invite email link) |
| POST | `/staff/invite` | StaffJwtGuard + RolesGuard (owner/admin/manager) | Authenticated staff |
| POST | `/members/register` | Public | Member mobile app / front desk |

### Files delivered

```
src/auth/                          ← AuthModule (complete)
  auth.module.ts
  auth.controller.ts
  auth.service.ts
  strategies/staff-jwt.strategy.ts
  strategies/member-jwt.strategy.ts
  guards/staff-jwt.guard.ts
  guards/member-jwt.guard.ts
  guards/roles.guard.ts
  decorators/public.decorator.ts
  decorators/roles.decorator.ts
  decorators/current-user.decorator.ts
  dto/staff-login.dto.ts
  dto/member-login.dto.ts
  dto/accept-invite.dto.ts

src/common/interfaces/
  jwt-payload.interface.ts

src/staff/                         ← StaffModule (partial)
  staff.module.ts
  staff.controller.ts              ← POST /staff/invite
  staff.service.ts
  dto/invite-staff.dto.ts

src/members/                       ← MembersModule (partial)
  members.module.ts
  members.controller.ts            ← POST /members/register
  members.service.ts
  dto/register-member.dto.ts

src/communication/                 ← CommunicationModule (partial)
  communication.module.ts
  mail.service.ts                  ← Nodemailer, Gmail SMTP

src/main.ts                        ← ValidationPipe registered globally
```

## 6. Pending Modules

- [ ] OrganizationModule — controller + service (entity exists)
- [ ] GymModule — controller + service (entity exists)
- [ ] StaffModule — expand: gym access management, staff list, profile, revoke access
- [ ] MembersModule — expand: waiver upload, member list/search, pause/cancel, profile edit
- [ ] PlansModule — MembershipPlan and Discount CRUD
- [ ] SubscriptionsModule — subscription lifecycle; note: add `discount_id` FK to MemberSubscription before implementing
- [ ] InvoicesModule — invoice generation; snapshot vat_number + invoice_number at creation
- [ ] VatModule — VatPeriodSummary aggregation; org rollup is a query not a stored record
- [ ] ClassScheduleModule — RRULE-based SlotTemplate; Slot instance generation
- [ ] BookingsModule — waitlist via `waitlist_position`; QR token is a signed JWT (booking_id + member_id + slot_id)
- [ ] CommunicationModule — expand: PushService, NotificationLog, email templates for other flows
- [ ] ReportsModule — AiReport (daily, per gym, via Gemini); OrgReport (monthly, aggregates all gyms)

## 7. Key Architectural Decisions

**Junction tables for gym access**
Staff and Members do not have a direct FK to Gym. Access is always through `StaffGymAccess` and `MemberGymAccess`. This allows one staff or member to belong to multiple branches with per-row lifecycle (granted, revoked).

**gym_ids baked into JWT at login**
At login time, the service queries active junction rows and embeds `gym_ids` directly into the token payload. Guards and services read gym scope from the token — no extra DB call per request. Token must be re-issued when gym access changes.

**synchronize off in production**
`TypeOrmModule` sets `synchronize: config.get('NODE_ENV') !== 'production'`. Run migrations explicitly in production.

**autoLoadEntities: true**
Entities are registered per-module via `TypeOrmModule.forFeature(...)`. No manual entity list in `AppModule`. New entities are picked up automatically as long as their module imports `forFeature`.

**org_owner / org_admin bypass StaffGymAccess**
These roles have org-wide authority. Guards should check `role === org_owner || role === org_admin` as an early-pass before checking `gym_ids` membership.

**Discount FK missing on MemberSubscription**
Currently there is no `discount_id` on `MemberSubscription`. Before implementing SubscriptionsModule, add this nullable FK to track which discount was applied to each subscription.

**Booking QR token**
`qr_token` on Booking is a signed JWT containing `booking_id + member_id + slot_id`. Check-in verifies the JWT signature without a DB lookup — stateless gate.

## 8. JWT Payload Shapes

### StaffJwtPayload
```typescript
{
  sub: string;        // StaffUser.id (UUID)
  email: string;
  role: StaffRole;    // 'org_owner' | 'org_admin' | 'gym_manager' | 'front_desk'
  org_id: string;     // StaffUser.organization_id
  gym_ids: string[];  // active StaffGymAccess rows for this staff (empty for org_owner/admin is fine — guards bypass on role)
}
```

### MemberJwtPayload
```typescript
{
  sub: string;            // Member.id (UUID)
  email: string;
  gym_ids: string[];      // all active MemberGymAccess rows
  primary_gym_id: string; // the row where is_primary = true
  status: MemberStatus;   // 'active' | 'paused' | 'expired' | 'cancelled'
}
```

Source of truth: `src/common/interfaces/jwt-payload.interface.ts`

## 9. Environment Variables

| Variable | Purpose |
|---|---|
| `DB_HOST` | Postgres host |
| `DB_PORT` | Postgres port |
| `DB_USER` | Postgres user |
| `DB_PASSWORD` | Postgres password |
| `DB_NAME` | Database name |
| `JWT_SECRET` | HS256 signing secret for all tokens |
| `JWT_EXPIRES_IN` | Token TTL (default: `7d`) |
| `NODE_ENV` | `production` disables TypeORM synchronize |
