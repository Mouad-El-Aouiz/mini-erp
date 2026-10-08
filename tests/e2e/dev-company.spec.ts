import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";

// The script intentionally accepts only a database named mini_erp. Create that
// database inside the isolated test service, never on the development service.
const source = new URL(process.env.TEST_DATABASE_URL!);
if (!['localhost', '127.0.0.1'].includes(source.hostname) ||
    !['/mini_erp_test', '/mini_erp_ci'].includes(source.pathname)) {
  throw new Error("Provisioning checks require the isolated test service.");
}
const admin = new Pool({ connectionString: source.toString() });
const target = new URL(source);
target.pathname = '/mini_erp';
const database = new Pool({ connectionString: target.toString() });
const userId = randomUUID();
const email = `setup-${userId}@example.test`;
const companyId = randomUUID();
let ownsDatabase = false;

function runSetup(overrides: Record<string, string> = {}) {
  const result = spawnSync(process.execPath,
    ['--conditions=react-server', '--import', 'tsx', 'scripts/create-dev-company.ts'], {
      env: {
        ...process.env, NODE_ENV: 'test', DATABASE_URL: target.toString(),
        DEV_USER_EMAIL: email, DEV_TENANT_ID: companyId,
        DEV_TENANT_NAME: 'Provisioning Test Company', ...overrides,
      },
      encoding: 'utf-8', timeout: 15_000,
    });
  if (result.error) throw result.error;
  return result;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // Fail if a database already exists; never drop someone else's database.
  await admin.query('CREATE DATABASE mini_erp');
  ownsDatabase = true;
  const migration = spawnSync(process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: target.toString() },
      encoding: 'utf-8', timeout: 20_000,
    });
  expect(migration.status).toBe(0);
  await database.query(
    'INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
    [userId, 'Provisioning Test User', email],
  );
  await database.query(
    'INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
    [randomUUID(), userId, 'credential', userId, await hashPassword('Fixture-only-password-2026!')],
  );
});

test.afterAll(async () => {
  await database.end();
  try {
    if (ownsDatabase) await admin.query('DROP DATABASE mini_erp');
  } finally {
    await admin.end();
  }
});

test('development company setup rejects unsafe or invalid configuration', async () => {
  const configurations: Record<string, string>[] = [
    { NODE_ENV: 'production' },
    { DATABASE_URL: 'postgresql://demo:demo@database.invalid/mini_erp' },
    { DATABASE_URL: source.toString() },
    { DEV_TENANT_ID: 'invalid-id' },
    { DEV_TENANT_NAME: '   ' },
    { DEV_USER_EMAIL: '' },
  ];
  for (const overrides of configurations) {
    const result = runSetup(overrides);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('demo:demo');
    expect(result.stderr).not.toContain(target.toString());
  }
  expect((await database.query('SELECT id FROM tenants')).rowCount).toBe(0);
});

test('development company setup requires an existing credential user', async () => {
  expect(runSetup({ DEV_USER_EMAIL: 'missing@example.test' }).status).toBe(1);
  const noCredentialId = randomUUID();
  const noCredentialEmail = `no-credential-${noCredentialId}@example.test`;
  await database.query(
    'INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
    [noCredentialId, 'No Credential User', noCredentialEmail],
  );
  expect(runSetup({ DEV_USER_EMAIL: noCredentialEmail }).status).toBe(1);
  expect((await database.query('SELECT id FROM tenants')).rowCount).toBe(0);
});

test('development company setup is idempotent and preserves role and revocation', async () => {
  expect(runSetup().status).toBe(0);
  const first = await database.query('SELECT * FROM memberships WHERE tenant_id=$1', [companyId]);
  expect(first.rowCount).toBe(1);
  expect(first.rows[0].role).toBe('ADMIN');
  expect(first.rows[0].is_active).toBe(true);
  expect(runSetup().status).toBe(0);
  const repeated = await database.query('SELECT * FROM memberships WHERE tenant_id=$1', [companyId]);
  expect(repeated.rows).toEqual(first.rows);
  await database.query("UPDATE memberships SET role='EMPLOYEE', is_active=false WHERE tenant_id=$1", [companyId]);
  expect(runSetup({ DEV_TENANT_NAME: 'Unexpected Rename' }).status).toBe(0);
  const preserved = await database.query('SELECT role,is_active FROM memberships WHERE tenant_id=$1', [companyId]);
  expect(preserved.rows[0]).toEqual({ role: 'EMPLOYEE', is_active: false });
  expect((await database.query('SELECT name FROM tenants WHERE id=$1', [companyId])).rows[0].name).toBe('Provisioning Test Company');
});

test('development company setup never grants access to an existing unrelated company', async () => {
  const unrelatedId = randomUUID();
  await database.query('INSERT INTO tenants (id,name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)', [unrelatedId, 'Unrelated Company']);
  expect(runSetup({ DEV_TENANT_ID: unrelatedId }).status).toBe(1);
  expect((await database.query('SELECT id FROM memberships WHERE tenant_id=$1', [unrelatedId])).rowCount).toBe(0);
});

test('failed membership creation rolls back the company creation', async () => {
  const failedId = randomUUID();
  await database.query(`CREATE FUNCTION reject_setup_membership() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Simulated membership failure'; END $$`);
  await database.query('CREATE TRIGGER reject_setup_membership BEFORE INSERT ON memberships FOR EACH ROW EXECUTE FUNCTION reject_setup_membership()');
  try {
    expect(runSetup({ DEV_TENANT_ID: failedId }).status).toBe(1);
    expect((await database.query('SELECT id FROM tenants WHERE id=$1', [failedId])).rowCount).toBe(0);
  } finally {
    await database.query('DROP TRIGGER reject_setup_membership ON memberships');
    await database.query('DROP FUNCTION reject_setup_membership()');
  }
});
