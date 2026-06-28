# Authentication & Account Creation — How Everything Connects

## The Big Picture

Five endpoints across three modules cover the full identity lifecycle of this system.
NestJS authentication is built in layers — every request travels through a stack of
files before anything useful happens:

```
HTTP Request
     │
     ▼
  Controller     ← decides which method handles the route
     │
     ▼
  Guard          ← decides whether the request is allowed through at all
     │
     ▼
  Strategy       ← (JWT routes only) verifies the token and decodes its payload
     │
     ▼
  Service        ← runs the actual business logic
     │
     ▼
  Repository     ← talks to PostgreSQL via TypeORM
```

Each layer is a separate file with one job. That is why five endpoints
need this many files.

---

## Step 1 — Login & Token Issuance (AuthModule)

**Three endpoints. All public (no token required to reach them).**

```
POST /auth/staff/login
POST /auth/member/login
POST /auth/staff/invite/accept
```

### File 1 — `src/auth/auth.controller.ts`

The entry point. Defines the three routes and nothing else.
NestJS reads the `@Controller('auth')` and `@Post(...)` decorators at startup
and registers them in the routing table.

```
POST /auth/staff/login         → @Body() StaffLoginDto  → authService.loginStaff()
POST /auth/member/login        → @Body() MemberLoginDto → authService.loginMember()
POST /auth/staff/invite/accept → @Body() AcceptInviteDto → authService.acceptStaffInvite()
```

All three carry `@Public()` so the guards that would normally block unauthenticated
requests are bypassed before the user even has a token.

---

### Files 2, 3, 4 — DTOs: What Each Endpoint Accepts

```
src/auth/dto/staff-login.dto.ts     → { email, password }
src/auth/dto/member-login.dto.ts    → { email, password }
src/auth/dto/accept-invite.dto.ts   → { token, password }
```

A DTO (Data Transfer Object) is a plain TypeScript class whose fields carry
`class-validator` decorators:

```typescript
// staff-login.dto.ts
@IsEmail()             email: string     // rejects "notanemail"
@IsString()
@MinLength(6)          password: string  // rejects anything under 6 chars

// accept-invite.dto.ts
@IsString()            token: string     // the hex token from the invite email
@IsString()
@MinLength(8)          password: string  // new password the staff member chooses
```

The decorators attach metadata to the class. The `ValidationPipe` in `main.ts`
reads that metadata for every incoming request:

```typescript
// main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,             // strips fields NOT declared in the DTO
  forbidNonWhitelisted: true,  // returns 400 if unknown fields are sent
  transform: true,             // auto-casts the raw JSON body to the DTO class
}));
```

Without `ValidationPipe`, a request body missing the `email` field would reach
`AuthService` and crash with a cryptic TypeORM error instead of a clean 400.

---

### File 5 — `src/auth/auth.service.ts`

The brain of authentication. Three methods, one per endpoint.
It depends on three injected services:

```
AuthService
  ├── StaffService   (from StaffModule — finds staff in DB, queries gym access)
  ├── MembersService (from MembersModule — finds member in DB, queries gym access)
  └── JwtService     (from @nestjs/jwt — signs the token)
```

**`loginStaff(dto)`**
```
1. staffService.findByEmail(dto.email)
       → SELECT * FROM staff_users WHERE email = ?
       → throws 401 if not found or is_active = false

2. bcrypt.compare(dto.password, staff.password_hash)
       → throws 401 if password is wrong

3. staffService.getActiveGymIds(staff.id)
       → SELECT gym_id FROM staff_gym_access
         WHERE staff_id = ? AND is_active = true
       → returns string[] of gym UUIDs

4. jwtService.sign({ sub, email, role, org_id, gym_ids })
       → returns { access_token: "eyJ..." }
```

**`loginMember(dto)`**
```
1. membersService.findByEmail(dto.email)
       → throws 401 if not found

2. bcrypt.compare(dto.password, member.password_hash)
       → throws 401 if wrong

3. membersService.getActiveGymAccess(member.id)
       → SELECT gym_id, is_primary FROM member_gym_access
         WHERE member_id = ? AND is_active = true
       → returns { gym_ids: string[], primary_gym_id: string }

4. jwtService.sign({ sub, email, gym_ids, primary_gym_id, status })
       → returns { access_token: "eyJ..." }
```

**`acceptStaffInvite(dto)`**
```
1. staffService.acceptInvite(dto.token, dto.password)
       → find StaffUser WHERE invite_token = dto.token
       → throw 404 if not found
       → throw 400 if invite_expires_at < now
       → bcrypt.hash(dto.password, 12) → save as password_hash
       → clear invite_token + invite_expires_at
       → set is_active = true
       → return saved StaffUser

2. staffService.getActiveGymIds(staff.id)
       → at accept time the staff has no gym access yet → returns []
       → gym access is granted separately by a manager later

3. jwtService.sign({ sub, email, role, org_id, gym_ids: [] })
       → staff is now active and logged in
```

---

### Files 6, 7 — `src/staff/staff.service.ts` and `src/members/members.service.ts`

These are the data-access layer. `AuthService` does not touch the DB directly —
it always goes through these services.

**Methods used by auth (more will be added as modules expand):**

```
StaffService
  findByEmail(email)      → staffRepo.findOne({ where: { email } })
  getActiveGymIds(id)     → accessRepo.find({ where: { staff_id, is_active: true } })
  acceptInvite(token, pw) → find by token → validate expiry → hash pw → save

MembersService
  findByEmail(email)      → memberRepo.findOne({ where: { email } })
  getActiveGymAccess(id)  → accessRepo.find({ where: { member_id, is_active: true } })
                            → returns { gym_ids, primary_gym_id }
```

These services are declared as `providers` in their own modules and listed in
`exports` so `AuthModule` (which imports both modules) can inject them.

---

### File 8 — `src/common/interfaces/jwt-payload.interface.ts`

A pure TypeScript contract. Zero runtime JavaScript — it disappears after compilation.
It defines the exact shape of what gets baked into the JWT:

```typescript
StaffJwtPayload {
  sub: string        // staff user UUID (the "subject" field — JWT standard)
  email: string
  role: StaffRole    // 'org_owner' | 'org_admin' | 'gym_manager' | 'front_desk'
  org_id: string     // which organization this staff belongs to
  gym_ids: string[]  // which gym branches they can access (from StaffGymAccess)
}

MemberJwtPayload {
  sub: string          // member UUID
  email: string
  gym_ids: string[]    // all branches they have active access to
  primary_gym_id: string  // the branch they registered at (is_primary = true)
  status: MemberStatus // 'active' | 'paused' | 'expired' | 'cancelled'
}
```

This interface is imported in four places: `auth.service.ts` (to type the sign call),
`staff-jwt.strategy.ts`, `member-jwt.strategy.ts` (to type the validate return),
and any controller that uses `@CurrentUser()`.

---

### Files 9, 10 — `src/auth/strategies/staff-jwt.strategy.ts` and `member-jwt.strategy.ts`

A Passport strategy is the component that actually opens a JWT and verifies it.
`passport-jwt` handles the heavy lifting: it reads the `Authorization: Bearer <token>`
header, verifies the HMAC-SHA256 signature using `JWT_SECRET`, checks expiry, and
then calls `validate()` with the decoded payload.

```typescript
// Both strategies follow the same pattern:
@Injectable()
export class StaffJwtStrategy extends PassportStrategy(Strategy, 'staff-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,  // from .env
    });
  }

  validate(payload: StaffJwtPayload): StaffJwtPayload {
    return payload;  // this return value becomes req.user
  }
}
```

The string name in `PassportStrategy(Strategy, 'staff-jwt')` must match the string
in `AuthGuard('staff-jwt')` in the guard file. A mismatch causes a runtime crash.

---

### Files 11, 12, 13 — `src/auth/guards/`

Three guards. They control access at the route level.

**`staff-jwt.guard.ts` and `member-jwt.guard.ts`** — same pattern, different strategy:

```
Incoming request
      │
      ▼
  Is @Public() on this route?
  ├── YES → skip everything, pass through
  └── NO  → delegate to passport-jwt strategy
                 │
                 ├── Token missing       → 401 Unauthorized
                 ├── Token expired       → 401 Unauthorized
                 ├── Signature invalid   → 401 Unauthorized
                 └── Token valid         → req.user = payload, continue
```

The `@Public()` check works via the NestJS `Reflector` — it reads the metadata
that `@Public()` attached to the route handler. This is how the login endpoints
receive unauthenticated requests without causing a 401 loop.

**`roles.guard.ts`** — always runs after a JWT guard has set `req.user`:

```
req.user already set (by StaffJwtGuard)
      │
      ▼
  Does @Roles() exist on this route?
  ├── NO  → pass through (any authenticated staff can access)
  └── YES → check req.user.role against the allowed roles list
                 │
                 ├── Role is in the list → continue
                 └── Role is not in list → 403 Forbidden
```

---

### Files 14, 15, 16 — `src/auth/decorators/`

Three decorators. None of them contain logic — they attach metadata or read from
the request context.

**`public.decorator.ts`**
```typescript
export const Public = () => SetMetadata('isPublic', true);
```
Stamps a route with a flag. The guards read this flag via Reflector.
Use on any route that must be accessible without a token.

**`roles.decorator.ts`**
```typescript
export const Roles = (...roles: StaffRole[]) => SetMetadata('roles', roles);
```
Stamps a route with a required role list. RolesGuard reads it.
```typescript
// Usage:
@Roles(StaffRole.ORG_OWNER, StaffRole.GYM_MANAGER)
@Post('staff/invite')
```

**`current-user.decorator.ts`**
```typescript
export const CurrentUser = createParamDecorator(
  (_, ctx) => ctx.switchToHttp().getRequest().user
);
```
A param decorator — reads `req.user` (populated by the JWT strategy) and injects
it directly into the method parameter:
```typescript
inviteStaff(@CurrentUser() user: StaffJwtPayload)
// instead of
inviteStaff(@Req() req) { const user = req.user as StaffJwtPayload; }
```

---

### File 17 — `src/auth/auth.module.ts`

The wiring file. Imports everything the auth system needs and exports what other
modules will reuse.

```
AuthModule
  IMPORTS:
    PassportModule            → registers Passport.js with NestJS DI container
    JwtModule.registerAsync   → creates JwtService with JWT_SECRET from .env
    StaffModule               → exposes StaffService to AuthService
    MembersModule             → exposes MembersService to AuthService

  PROVIDERS (usable inside this module only):
    AuthService
    StaffJwtStrategy          → registered as a Passport named strategy 'staff-jwt'
    MemberJwtStrategy         → registered as a Passport named strategy 'member-jwt'
    StaffJwtGuard
    MemberJwtGuard
    RolesGuard

  EXPORTS (usable by any module that imports AuthModule):
    StaffJwtGuard             → so StaffController can apply it
    MemberJwtGuard
    RolesGuard
    JwtModule                 → so other modules can use JwtService if needed
```

---

---

## Step 2 — Account Creation (StaffModule + MembersModule + CommunicationModule)

**Two endpoints. One protected, one public.**

```
POST /staff/invite       ← requires Staff JWT + role: owner/admin/manager
POST /members/register   ← public
```

### Why these are NOT in AuthModule

Authentication = verifying identity.
Registration = creating identity.

These are separate responsibilities. Mixing them into `AuthModule` would make it
responsible for staff management and member onboarding — which are the jobs of
`StaffModule` and `MembersModule`. `AuthModule` stays focused on tokens only.

---

### File 1 — `src/staff/dto/invite-staff.dto.ts`

```typescript
{ email: string, full_name: string, role: StaffRole }
```

`email` and `role` are stored in the database.
`full_name` is used **only** in the invite email greeting — the `StaffUser` entity
has no name column (entities are finalized and cannot be changed). The staff
member's display name can be captured in a future profile endpoint.

```typescript
@IsEmail()                email    // validated before service is called
@IsString() @MinLength(2) full_name
@IsEnum(StaffRole)        role     // rejects invalid roles at the boundary
```

---

### File 2 — `src/members/dto/register-member.dto.ts`

```typescript
{ email, full_name, password, phone?, gym_id }
```

`gym_id` is the UUID of the gym branch the member is registering at.
It becomes the `gym_id` in the `MemberGymAccess` junction row that the service creates.

```typescript
@IsEmail()                email
@IsString() @MinLength(2) full_name
@IsString() @MinLength(8) password
@IsString() @IsOptional() phone      // optional — member may not have phone
@IsUUID()                 gym_id     // validates it's a real UUID format
```

---

### File 3 — `src/communication/mail.service.ts`

The Nodemailer wrapper. Single responsibility: send emails.

```
MailService
  constructor
    └── creates nodemailer transporter
          service: 'gmail'
          auth: { user: EMAIL_USER, pass: EMAIL_PASS }  ← from .env
                (EMAIL_PASS is a Gmail App Password, not the account password)

  sendStaffInvite(toEmail, staffName, inviteToken)
    └── builds invite link: FRONTEND_URL/accept-invite?token=<token>
           ↑ FRONTEND_URL from .env (defaults to http://localhost:3001)
    └── sends HTML email with a styled "Accept Invitation" button
    └── throws InternalServerErrorException if nodemailer fails
           (so the controller returns 500, not a silent failure)
```

This service lives in `CommunicationModule` because it is a cross-cutting concern —
many future modules will need to send emails (invoices, booking confirmations, payment
failures). Centralizing it here means they all import `CommunicationModule` and
inject `MailService`, rather than each configuring their own transporter.

---

### File 4 — `src/communication/communication.module.ts` (updated)

```
CommunicationModule
  IMPORTS:  TypeOrmModule (NotificationLog repo)
  PROVIDERS: MailService
  EXPORTS:   MailService    ← explicitly exported so StaffModule can inject it
```

Without `exports: [MailService]`, any module that imports `CommunicationModule`
would get an injection error — NestJS modules are private by default.

---

### File 5 — `src/staff/staff.service.ts` — `inviteStaff()` method

The four existing auth-support methods (`findByEmail`, `getActiveGymIds`,
`acceptInvite`) stay in this file. `inviteStaff` is added alongside them.

```
inviteStaff(dto: InviteStaffDto, invitedByOrgId: string)

1. Check for existing account
   staffRepo.findOne({ where: { email: dto.email } })
   → throw 409 ConflictException if found
     (duplicate email = duplicate identity = hard error)

2. Generate a secure invite token
   crypto.randomBytes(32).toString('hex')
   → 64 character lowercase hex string
   → crypto is built into Node.js, no package needed
   → randomBytes is cryptographically secure (not Math.random)

3. Set expiry
   now + 72 hours → stored in invite_expires_at column

4. Create placeholder password hash
   bcrypt.hash(crypto.randomUUID(), 10)
   → a valid bcrypt hash of a random UUID nobody knows
   → needed because password_hash is NOT NULL in the DB schema
   → even if extracted from DB, it is useless — you cannot reverse bcrypt
   → is_active = false means loginStaff() rejects this account on every login
     attempt anyway, as a second line of defence

5. staffRepo.save(staff)
   → INSERT INTO staff_users (email, role, org_id, password_hash,
                              invite_token, invite_expires_at, is_active)
     VALUES (...)

6. mailService.sendStaffInvite(dto.email, dto.full_name, inviteToken)
   → sends the email (throws 500 if nodemailer fails)

7. return { message: "Invitation sent to <email>" }
```

**Where does `invitedByOrgId` come from?**
It comes from the JWT payload of the staff member making the request —
`user.org_id` from `@CurrentUser()`. This ensures the new staff record is
created inside the same organization as the person sending the invite.
No org_id is accepted from the request body — the client cannot forge it.

---

### File 6 — `src/members/members.service.ts` — `register()` method

The three existing auth-support methods stay. `register` is added alongside them.

```
register(dto: RegisterMemberDto)

1. Check for duplicate email
   memberRepo.findOne({ where: { email } })
   → throw 409 ConflictException if found

2. Hash password
   bcrypt.hash(dto.password, 12)
   → cost factor 12: ~250ms on modern hardware — slow enough to resist brute force,
     fast enough not to frustrate users

3. Create Member record
   memberRepo.create({ email, full_name, phone, password_hash })
   → status defaults to MemberStatus.ACTIVE (set in entity)
   → no gym_id on Member itself — gym context always goes through the junction

4. memberRepo.save(member)
   → INSERT INTO members (...)

5. Create MemberGymAccess junction row
   accessRepo.create({
     member_id: saved.id,
     gym_id: dto.gym_id,
     is_primary: true,   ← first gym is always the primary
     is_active: true,
   })
   accessRepo.save(...)
   → INSERT INTO member_gym_access (...)

6. return { message: "Account created. You can now log in.", member_id: saved.id }
```

**Why return `member_id` but not a token?**
`MembersModule` cannot import `AuthModule` (which already imports `MembersModule`)
without creating a circular dependency that NestJS cannot resolve at startup.
The client receives the `member_id` and immediately calls `POST /auth/member/login`
to get their token. Two calls, but zero circular imports.

---

### File 7 — `src/staff/staff.controller.ts`

```typescript
@UseGuards(StaffJwtGuard, RolesGuard)   // applied to the whole controller
@Controller('staff')
export class StaffController {

  @Post('invite')
  @Roles(StaffRole.ORG_OWNER, StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  inviteStaff(@Body() dto, @CurrentUser() user: StaffJwtPayload) {
    return this.staffService.inviteStaff(dto, user.org_id);
  }
}
```

Three things happening on a single route:
- `StaffJwtGuard` verifies the Bearer token → populates `req.user`
- `RolesGuard` checks `req.user.role` is in the allowed list → 403 if not
- `@CurrentUser()` extracts `req.user` as a typed `StaffJwtPayload`
- `user.org_id` is passed to the service so the invite is scoped to the right org

`front_desk` is intentionally excluded from `@Roles()`. Front desk staff can
check in members but cannot create new staff accounts.

---

### File 8 — `src/members/members.controller.ts`

```typescript
@Controller('members')
export class MembersController {

  @Public()         // no token needed — anyone can register
  @Post('register')
  register(@Body() dto: RegisterMemberDto) {
    return this.membersService.register(dto);
  }
}
```

`@Public()` works here because `StaffJwtGuard` (if applied globally in the future)
reads the metadata and skips token verification. Even though this is `MembersController`
not `AuthController`, the same decorator works anywhere in the application.

---

### File 9 — `src/staff/staff.module.ts` (updated)

```
StaffModule
  IMPORTS:
    TypeOrmModule.forFeature([StaffUser, StaffGymAccess])
      → registers the TypeORM Repository<StaffUser> and Repository<StaffGymAccess>
        in NestJS DI so StaffService can @InjectRepository() them
    CommunicationModule
      → makes MailService injectable inside this module

  CONTROLLERS: StaffController
  PROVIDERS:   StaffService
  EXPORTS:     StaffService   ← so AuthModule can inject it for login/invite-accept
```

---

### File 10 — `src/members/members.module.ts` (updated)

```
MembersModule
  IMPORTS:
    TypeOrmModule.forFeature([Member, MemberGymAccess, Waiver])
      → Waiver repo registered even though MembersService doesn't use it yet —
        it will be needed for the waiver signing endpoint later

  CONTROLLERS: MembersController
  PROVIDERS:   MembersService
  EXPORTS:     MembersService  ← so AuthModule can inject it for login
```

---

## Full System Dependency Graph

```
app.module.ts
│
├── CommunicationModule
│   ├── TypeOrmModule (NotificationLog)
│   └── MailService ──────────────────────── exports: [MailService]
│
├── StaffModule ─────────────────────────── exports: [StaffService]
│   ├── TypeOrmModule (StaffUser, StaffGymAccess)
│   ├── CommunicationModule ──────────────── MailService injected here
│   ├── StaffController
│   │   └── POST /staff/invite ──────────── StaffJwtGuard + RolesGuard
│   └── StaffService
│       ├── findByEmail()
│       ├── getActiveGymIds()
│       ├── acceptInvite()
│       └── inviteStaff() ───────────────── uses MailService
│
├── MembersModule ───────────────────────── exports: [MembersService]
│   ├── TypeOrmModule (Member, MemberGymAccess, Waiver)
│   ├── MembersController
│   │   └── POST /members/register ──────── @Public
│   └── MembersService
│       ├── findByEmail()
│       ├── getActiveGymAccess()
│       └── register()
│
└── AuthModule
    ├── PassportModule
    ├── JwtModule ───────────────────────── JWT_SECRET from .env
    ├── StaffModule  ────────────────────── StaffService injected here
    ├── MembersModule ───────────────────── MembersService injected here
    ├── AuthController
    │   ├── POST /auth/staff/login ──────── @Public
    │   ├── POST /auth/member/login ─────── @Public
    │   └── POST /auth/staff/invite/accept ─ @Public
    ├── AuthService ─────────────────────── uses StaffService + MembersService + JwtService
    ├── StaffJwtStrategy ────────────────── 'staff-jwt' passport strategy
    ├── MemberJwtStrategy ───────────────── 'member-jwt' passport strategy
    ├── StaffJwtGuard ───────────────────── respects @Public, delegates to StaffJwtStrategy
    ├── MemberJwtGuard ──────────────────── respects @Public, delegates to MemberJwtStrategy
    └── RolesGuard ──────────────────────── checks req.user.role vs @Roles(...)
```

---

## End-to-End Flows — The Full Picture So Far

### Flow 1 — Gym Owner Onboards a New Staff Member

```
Step 1: Owner logs in
──────────────────────────────────────────────────────────────
Client sends:
  POST /auth/staff/login
  { email: "owner@gymchain.com", password: "..." }

Server:
  StaffJwtGuard → @Public() → passes through
  AuthController.loginStaff()
  AuthService.loginStaff()
    → finds StaffUser in DB (role = org_owner, is_active = true)
    → bcrypt.compare passes
    → getActiveGymIds → [] (org_owner bypasses junction at guard level)
    → signs JWT: { sub, email, role: 'org_owner', org_id, gym_ids: [] }

Client receives:
  { access_token: "eyJ..." }   ← stored in the client, sent on every future request


Step 2: Owner sends invite to a new gym manager
──────────────────────────────────────────────────────────────
Client sends:
  POST /staff/invite
  Authorization: Bearer eyJ...
  { email: "manager@gymchain.com", full_name: "Sara Ali", role: "gym_manager" }

Server:
  StaffJwtGuard → token valid → req.user = { sub, role: 'org_owner', org_id, ... }
  RolesGuard → org_owner is in allowed list → passes
  StaffController.inviteStaff()
  StaffService.inviteStaff(dto, user.org_id)
    → no existing account with that email ✓
    → generates invite token: "a3f9c2...64 hex chars"
    → invite_expires_at = now + 72 hours
    → creates StaffUser: { email, role: 'gym_manager', org_id, is_active: false }
    → saves to staff_users table
    → MailService.sendStaffInvite(email, "Sara Ali", token)
         → nodemailer sends HTML email from EMAIL_USER
         → link: http://localhost:3001/accept-invite?token=a3f9c2...

Client receives:
  { message: "Invitation sent to manager@gymchain.com" }


Step 3: Sara clicks the link and sets her password
──────────────────────────────────────────────────────────────
Sara opens the email, clicks "Accept Invitation"
Frontend reads the token from the URL query param and calls:

  POST /auth/staff/invite/accept
  { token: "a3f9c2...", password: "MyNewPass123!" }

Server:
  StaffJwtGuard → @Public() → passes through
  AuthController.acceptInvite()
  AuthService.acceptStaffInvite()
  StaffService.acceptInvite(token, password)
    → finds StaffUser WHERE invite_token = "a3f9c2..."
    → invite_expires_at is still in the future ✓
    → bcrypt.hash("MyNewPass123!", 12) → stored as password_hash
    → invite_token = null, invite_expires_at = null, is_active = true
    → saves updated StaffUser
  getActiveGymIds(staff.id) → [] (no gym access assigned yet)
  jwtService.sign({ sub, email, role: 'gym_manager', org_id, gym_ids: [] })

Sara receives:
  { access_token: "eyJ..." }   ← she is now logged in
```

---

### Flow 2 — Member Self-Registers via the Mobile App

```
Step 1: Member opens the app and registers
──────────────────────────────────────────────────────────────
Client sends:
  POST /members/register
  {
    email: "ahmed@gmail.com",
    full_name: "Ahmed Khan",
    password: "SecurePass99!",
    phone: "0300-1234567",    ← optional
    gym_id: "uuid-of-gulberg-branch"
  }

Server:
  No guard — @Public()
  MembersController.register()
  MembersService.register(dto)
    → no existing member with that email ✓
    → bcrypt.hash("SecurePass99!", 12) → password_hash
    → memberRepo.save({ email, full_name, phone, password_hash })
         INSERT INTO members (email, full_name, phone, password_hash, status)
         VALUES (..., 'active')
         → member.id = "new-uuid"
    → accessRepo.save({
         member_id: "new-uuid",
         gym_id: "uuid-of-gulberg-branch",
         is_primary: true,
         is_active: true
      })
         INSERT INTO member_gym_access (member_id, gym_id, is_primary, is_active)
         VALUES (...)

Client receives:
  { message: "Account created. You can now log in.", member_id: "new-uuid" }


Step 2: Member logs in to get their token
──────────────────────────────────────────────────────────────
Client sends:
  POST /auth/member/login
  { email: "ahmed@gmail.com", password: "SecurePass99!" }

Server:
  MemberJwtGuard → @Public() → passes through
  AuthController.loginMember()
  AuthService.loginMember()
    → membersService.findByEmail("ahmed@gmail.com") → Member found
    → bcrypt.compare passes
    → membersService.getActiveGymAccess("new-uuid")
         → [{ gym_id: "uuid-of-gulberg-branch", is_primary: true }]
         → gym_ids: ["uuid-of-gulberg-branch"]
         → primary_gym_id: "uuid-of-gulberg-branch"
    → jwtService.sign({
         sub: "new-uuid",
         email: "ahmed@gmail.com",
         gym_ids: ["uuid-of-gulberg-branch"],
         primary_gym_id: "uuid-of-gulberg-branch",
         status: "active"
      })

Client receives:
  { access_token: "eyJ..." }   ← every future request includes this token
```

---

### Flow 3 — Front Desk Staff Registers a Member at the Counter

```
Step 1: Front desk staff is already logged in
    access_token from POST /auth/staff/login → role: 'front_desk'

Step 2: Staff fills in the new member's details on the dashboard
──────────────────────────────────────────────────────────────
Client sends:
  POST /members/register
  Authorization: Bearer eyJ...front_desk_token...
  {
    email: "sara@outlook.com",
    full_name: "Sara Malik",
    password: "TempPass123!",   ← staff sets a temp password, member changes it later
    gym_id: "uuid-of-dha-branch"
  }

Server:
  @Public() — the guard is bypassed regardless of whether a token is present
  MembersService.register(dto) → same flow as self-registration above

Client receives:
  { message: "Account created.", member_id: "..." }

Note: In this flow the front desk staff provides a temporary password.
A "force password reset on first login" mechanism would be a future improvement —
it would require adding a `must_reset_password` boolean to the Member entity.
```

---

## What Happens to a Token in Protected Routes (Preview)

Once a staff member or member has a token, every subsequent request to a protected
endpoint works like this:

```
Client sends:
  GET /some/protected/route
  Authorization: Bearer eyJ...

  ↓
  StaffJwtGuard (applied via @UseGuards on controller)
    → reads Authorization header
    → passes token to StaffJwtStrategy
         → passport-jwt verifies signature with JWT_SECRET
         → decodes payload: { sub, email, role, org_id, gym_ids }
         → calls validate(payload) → returns payload as-is
         → sets req.user = payload
    → guard sees req.user is set → passes

  ↓
  RolesGuard (if present)
    → reads @Roles(...) metadata
    → checks req.user.role against allowed list
    → passes or returns 403

  ↓
  Controller method runs
    → @CurrentUser() user: StaffJwtPayload  ← req.user typed and injected
    → method knows: who this is, what org they belong to, which gyms they can see
```

This pattern repeats in every module yet to be built — `GymModule`, `PlansModule`,
`BookingsModule`, etc. The guards and decorators are already built and exported from
`AuthModule`. Each new module just imports `AuthModule` and uses them.
