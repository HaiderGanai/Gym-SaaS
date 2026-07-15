---
name: verify
description: How to boot and drive this NestJS API against a scratch DB for runtime verification
---

# Verifying gym-saas changes

**Never boot against the `.env` DB** — it points at the deployed droplet (178.128.54.158) and TypeORM `synchronize: true` will alter the live schema. Use a scratch DB on the local Postgres (localhost:5432, user `postgres`, password = the commented `# DB_PASSWORD` line in `.env`).

```bash
psql -h localhost -U postgres -c "CREATE DATABASE gym_saas_verify"
npm run build
DB_HOST=localhost DB_USER=postgres DB_PASSWORD=<local pw> DB_NAME=gym_saas_verify \
  PORT=4100 JWT_SECRET=verify-secret NODE_ENV=development node dist/main.js &
# schema is created by synchronize on boot; THEN seed:
DB_HOST=localhost DB_USER=postgres DB_PASSWORD=<local pw> DB_NAME=gym_saas_verify node seed.js
```

- Seed prints fresh org/gym IDs + logins (`owner@test.com` / `Test1234!`, `super@platform.com` / `Super1234!`).
- Base URL: `http://localhost:4100/api/v1`. Login → `access_token` → `Authorization: Bearer`.
- The user's own dev server often runs on **port 3000** from the main checkout — don't `pkill -f "node dist/main.js"`; kill only your own PID.
- Member flows: `POST /members/register` (public, needs `gym_id`) then `POST /auth/member/login`.
- No SMTP creds in scratch env — email sends fail; endpoints that email best-effort still succeed.
- Simulate bookings with SQL (`INSERT INTO bookings ...; UPDATE slots SET booking_count=...`) to hit conflict paths.
- Cleanup: kill your server PID, `DROP DATABASE gym_saas_verify`.
