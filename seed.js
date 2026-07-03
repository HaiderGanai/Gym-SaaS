// seed.js — creates super_admin, test org, gym branch, and org_admin account
// Run: node seed.js  (start the app once first so TypeORM creates tables)
require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function seed() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await client.connect();

  try {
    const [superHash, adminHash] = await Promise.all([
      bcrypt.hash('Super1234!', 10),
      bcrypt.hash('Test1234!', 10),
    ]);

    // Platform super_admin — no org affiliation
    const { rows: [superAdmin] } = await client.query(
      `INSERT INTO staff_users (organization_id, email, password_hash, role, is_active)
       VALUES (NULL, 'super@platform.com', $1, 'super_admin', true)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [superHash],
    );

    // Organization — seeded as 'active' so the dev org_admin isn't locked out
    // by the platform SubscriptionInterceptor
    const { rows: [org] } = await client.query(
      `INSERT INTO organizations (name, currency, subscription_status)
       VALUES ($1, $2, 'active')
       ON CONFLICT DO NOTHING
       RETURNING id`,
      ['Test Gym Chain', 'GBP'],
    );

    if (!org) {
      console.log('Organization already exists — skipping org/gym/admin seed.');
      if (superAdmin) console.log('  super_admin created: super@platform.com / Super1234!');
      return;
    }

    // Gym branch
    const { rows: [gym] } = await client.query(
      `INSERT INTO gyms (organization_id, name, address, timezone)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [org.id, 'Main Branch', '1 Fitness Street, London', 'Europe/London'],
    );

    // Org admin
    const { rows: [admin] } = await client.query(
      `INSERT INTO staff_users (organization_id, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'org_admin', true)
       RETURNING id`,
      [org.id, 'owner@test.com', adminHash],
    );

    await client.query(
      `INSERT INTO staff_gym_access (staff_id, gym_id, is_active)
       VALUES ($1, $2, true)`,
      [admin.id, gym.id],
    );

    console.log('Seed complete:');
    console.log('  [super_admin]  super@platform.com  / Super1234!');
    console.log('  [org_admin]    owner@test.com       / Test1234!');
    console.log('  org_id  :', org.id);
    console.log('  gym_id  :', gym.id);
  } finally {
    await client.end();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
