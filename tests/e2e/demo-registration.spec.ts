import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";
import { verifyPassword } from "better-auth/crypto";
import { execFileSync } from "node:child_process";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
function cleanup() {
  execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/cleanup-demos.ts"], {
    env: { ...process.env, DEMO_CLEANUP_CONFIRM: "mini-erp-demo-cleanup" }, encoding: "utf8",
  });
}
const runId = randomUUID();
const password = "Demo-test-password-2026!";
const origin = "http://127.0.0.1:3100";
const emails: string[] = [];
const attemptIds = new Set<string>();
async function register(request: APIRequestContext, label: string, overrides = {}) {
  const email = `${label}-${runId}@example.test`; emails.push(email);
  const before = await pool.query('SELECT id FROM demo_signup_attempts');
  const known = new Set(before.rows.map(row => row.id));
  const response = await request.post("/api/demo/sign-up", { headers: { Origin: origin }, data: { name: "Demo visitor", email, password, consent: true, ...overrides } });
  const after = await pool.query('SELECT id FROM demo_signup_attempts');
  for (const row of after.rows) if (!known.has(row.id)) attemptIds.add(row.id);
  return { response, email };
}
async function signIn(request: APIRequestContext, email: string) {
  let response = await request.post("/api/auth/sign-in/email", { headers: { Origin: origin }, data: { email, password } });
  if (response.status() === 429) {
    const delay = Number(response.headers()["retry-after"] ?? response.headers()["x-retry-after"]);
    expect(delay).toBeLessThanOrEqual(10);
    await new Promise(resolve => setTimeout(resolve, (delay + 1) * 1000));
    response = await request.post("/api/auth/sign-in/email", { headers: { Origin: origin }, data: { email, password } });
  }
  expect(response.status()).toBe(200);
}
async function workspace(email: string) {
  const result = await pool.query('SELECT t.id, t.demo_owner_id, m.id AS membership_id FROM tenants t JOIN "user" u ON u.id=t.demo_owner_id JOIN memberships m ON m.tenant_id=t.id AND m.user_id=u.id WHERE u.email=$1', [email]);
  return result.rows[0];
}
test.afterAll(async () => {
  try {
    await pool.query('UPDATE tenants SET demo_expires_at=CURRENT_TIMESTAMP - INTERVAL \'1 minute\' WHERE demo_owner_id IN (SELECT id FROM "user" WHERE email=ANY($1::text[]))', [emails]);
    cleanup();
    if (attemptIds.size) await pool.query('DELETE FROM demo_signup_attempts WHERE id=ANY($1::uuid[])', [[...attemptIds]]);
  } finally { await pool.end(); }
});

test("browser signup creates an isolated populated workspace and allows a complete order", async ({ page, request }) => {
  const email = `browser-${runId}@example.test`; emails.push(email);
  const before = await pool.query('SELECT id FROM demo_signup_attempts');
  const known = new Set(before.rows.map(row => row.id));
  await page.goto("/sign-in"); await page.getByRole("link", { name: "Try the demo" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Demo visitor");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create demo account" }).click();
  await expect(page.getByRole("status")).toContainText("Your demo account is ready.");
  const after = await pool.query('SELECT id FROM demo_signup_attempts');
  for (const row of after.rows) if (!known.has(row.id)) attemptIds.add(row.id);
  await page.getByRole("link", { name: "Sign in to your demo" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "Open Your demo company workspace" }).click();
  await expect(page.getByText(/This is a temporary demo/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage members" })).toHaveCount(0);
  const company = await workspace(email);
  const products = await page.request.get(`/api/tenants/${company.id}/products`);
  const productRows = (await products.json()).products; expect(productRows).toHaveLength(3);
  const customers = await page.request.get(`/api/tenants/${company.id}/customers`);
  const customerRows = (await customers.json()).customers; expect(customerRows).toHaveLength(2);
  const hash = await pool.query('SELECT a.password FROM account a WHERE a."userId"=$1', [company.demo_owner_id]);
  expect(await verifyPassword({ hash: hash.rows[0].password, password })).toBe(true);
  const created = await page.request.post(`/api/tenants/${company.id}/orders`, { headers: { Origin: origin }, data: { customerId: customerRows[0].id, requestId: randomUUID() } });
  expect(created.status()).toBe(201);
  const orderId = (await created.json()).order.id;
  const orderURL = `/api/tenants/${company.id}/orders/${orderId}`;
  const saved = await page.request.put(orderURL, { headers: { Origin: origin }, data: { version: 1, customerId: customerRows[0].id, items: [{ productId: productRows[0].id, quantity: 2 }] } });
  expect(saved.status()).toBe(200);
  const confirmed = await page.request.post(`${orderURL}/confirm`, { headers: { Origin: origin }, data: { version: 2, taxVersion: 1 } });
  expect(confirmed.status()).toBe(200);
  const delivered = await page.request.post(`${orderURL}/deliver`, { headers: { Origin: origin }, data: { version: 3 } });
  expect(delivered.status()).toBe(200);
  expect((await (await page.request.get(orderURL)).json()).order.status).toBe("DELIVERED");
  expect((await request.get(`/api/tenants/${company.id}/products`)).status()).toBe(401);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("registration rejects tampering, untrusted origins and oversized bodies", async ({ request }) => {
  const malformed = await register(request, "invalid", { tenantId: randomUUID() }); expect(malformed.response.status()).toBe(422);
  const noConsent = await register(request, "no-consent", { consent: false }); expect(noConsent.response.status()).toBe(422);
  const short = await register(request, "short", { password: "short" }); expect(short.response.status()).toBe(422);
  const hostile = await request.post("/api/demo/sign-up", { headers: { Origin: "https://hostile.example" }, data: {} }); expect(hostile.status()).toBe(403);
  expect((await request.post("/api/demo/sign-up", { headers: { Origin: origin, "Content-Type": "text/plain" }, data: "{}" })).status()).toBe(415);
  expect((await request.post("/api/demo/sign-up", { headers: { Origin: origin }, data: { name: "x".repeat(5000) } })).status()).toBe(413);
  expect((await request.get("/api/demo/sign-up")).status()).toBe(405);
});

test("separate demo accounts cannot access each other or provision members", async ({ request, playwright }) => {
  const a = await register(request, "isolated-a"); const b = await register(request, "isolated-b");
  expect(a.response.status()).toBe(201); expect(b.response.status()).toBe(201);
  const context = await playwright.request.newContext({ baseURL: origin });
  try {
    await signIn(context, a.email);
    const own = await workspace(a.email); const other = await workspace(b.email);
    expect((await context.get(`/api/tenants/${other.id}/customers`)).status()).toBe(403);
    const result = await context.post(`/api/tenants/${own.id}/members`, { headers: { Origin: origin }, data: { name: "Extra", email: `extra-${runId}@example.test`, password, role: "ADMIN" } });
    expect(result.status()).toBe(403);
    expect((await context.post("/api/demo/sign-up", { headers: { Origin: origin }, data: {} })).status()).toBe(409);
  } finally { await context.dispose(); }
});

test("duplicate registration preserves credentials and company identity", async ({ request }) => {
  const first = await register(request, "duplicate"); expect(first.response.status()).toBe(201);
  const before = await workspace(first.email);
  const second = await register(request, "duplicate", { password: "Replacement-password-2026!" }); expect(second.response.status()).toBe(409);
  expect((await workspace(first.email)).id).toBe(before.id);
  const hash = await pool.query('SELECT password FROM account WHERE "userId"=$1', [before.demo_owner_id]);
  expect(await verifyPassword({ hash: hash.rows[0].password, password })).toBe(true);
});

test("failed seed creation rolls back account and company together", async ({ request }) => {
  const trigger = `demo_failure_${runId.replaceAll("-", "")}`;
  await pool.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.sku='DEMO-MONITOR' THEN RAISE EXCEPTION 'Forced demo seed failure'; END IF; RETURN NEW; END $$`);
  await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
  try {
    const result = await register(request, "rollback"); expect(result.response.status()).toBe(500);
    expect((await pool.query('SELECT id FROM "user" WHERE email=$1', [result.email])).rowCount).toBe(0);
  } finally { await pool.query(`DROP TRIGGER ${trigger} ON products`); await pool.query(`DROP FUNCTION ${trigger}()`); }
});

test("customer creation budget is enforced under concurrent requests", async ({ request, playwright }) => {
  const registered = await register(request, "budget"); expect(registered.response.status()).toBe(201);
  const company = await workspace(registered.email);
  await pool.query('INSERT INTO customers (tenant_id,company_name,updated_at) SELECT $1,\'Budget fixture\',CURRENT_TIMESTAMP FROM generate_series(1,97)', [company.id]);
  const context = await playwright.request.newContext({ baseURL: origin });
  try {
    await signIn(context, registered.email);
    const responses = await Promise.all(["A", "B"].map(companyName => context.post(`/api/tenants/${company.id}/customers`, { headers: { Origin: origin }, data: { companyName } })));
    expect(responses.map(response => response.status()).sort()).toEqual([201,403]);
    expect((await pool.query('SELECT count(*)::int AS count FROM customers WHERE tenant_id=$1', [company.id])).rows[0].count).toBe(100);
  } finally { await context.dispose(); }
});

test("expired demos deny existing sessions and cleanup preserves ordinary companies", async ({ request, playwright }) => {
  const result = await register(request, "expiry"); expect(result.response.status()).toBe(201);
  const company = await workspace(result.email);
  const context = await playwright.request.newContext({ baseURL: origin });
  const ordinaryId = randomUUID();
  await pool.query('INSERT INTO tenants(id,name,updated_at) VALUES($1,\'Ordinary company fixture\',CURRENT_TIMESTAMP)', [ordinaryId]);
  try {
    await signIn(context, result.email);
    await pool.query('UPDATE tenants SET demo_expires_at=CURRENT_TIMESTAMP - INTERVAL \'1 minute\' WHERE id=$1', [company.id]);
    expect((await context.get(`/api/tenants/${company.id}/products`)).status()).toBe(403);
    cleanup();
    expect((await pool.query('SELECT id FROM "user" WHERE id=$1', [company.demo_owner_id])).rowCount).toBe(0);
    expect((await pool.query('SELECT id FROM tenants WHERE id=$1', [ordinaryId])).rowCount).toBe(1);
    expect(await (await context.get('/api/auth/get-session')).json()).toBeNull();
  } finally { await pool.query('DELETE FROM tenants WHERE id=$1', [ordinaryId]); await context.dispose(); }
});

test("product, order and adjustment budgets block additional records", async ({ request, playwright }) => {
  const result = await register(request, "remaining-budgets"); expect(result.response.status()).toBe(201);
  const company = await workspace(result.email);
  const product = (await pool.query('SELECT id FROM products WHERE tenant_id=$1 LIMIT 1', [company.id])).rows[0];
  const customer = (await pool.query('SELECT id FROM customers WHERE tenant_id=$1 LIMIT 1', [company.id])).rows[0];
  await pool.query('INSERT INTO products(tenant_id,sku,name,unit_price_cents,updated_at) SELECT $1,\'BUDGET-\'||n,\'Budget product\',100,CURRENT_TIMESTAMP FROM generate_series(1,97) n', [company.id]);
  await pool.query('INSERT INTO orders(tenant_id,customer_id,created_by_membership_id,request_id,request_hash,updated_at) SELECT $1,$2,$3,gen_random_uuid(),repeat(\'0\',64),CURRENT_TIMESTAMP FROM generate_series(1,100)', [company.id, customer.id, company.membership_id]);
  await pool.query('INSERT INTO stock_movements(tenant_id,product_id,recorded_by_membership_id,request_id,quantity_delta,reason) SELECT $1,$2,$3,gen_random_uuid(),1,\'Budget fixture\' FROM generate_series(1,1000)', [company.id,product.id,company.membership_id]);
  const context = await playwright.request.newContext({ baseURL: origin });
  try {
    await signIn(context, result.email);
    expect((await context.post(`/api/tenants/${company.id}/products`, { headers: { Origin: origin }, data: { sku: "OVER-BUDGET", name: "Extra", unitPriceCents: 100 } })).status()).toBe(403);
    expect((await context.post(`/api/tenants/${company.id}/orders`, { headers: { Origin: origin }, data: { customerId: customer.id, requestId: randomUUID() } })).status()).toBe(403);
    expect((await context.post(`/api/tenants/${company.id}/inventory/${product.id}/movements`, { headers: { Origin: origin }, data: { requestId: randomUUID(), quantityDelta: 1, reason: "Extra" } })).status()).toBe(403);
  } finally { await context.dispose(); }
});

test("cleanup skips a demo owner who has access to an ordinary company", async ({ request }) => {
  const result = await register(request, "cleanup-safety"); expect(result.response.status()).toBe(201);
  const company = await workspace(result.email);
  const ordinary = randomUUID();
  await pool.query('INSERT INTO tenants(id,name,updated_at) VALUES($1,\'Cleanup safety fixture\',CURRENT_TIMESTAMP)', [ordinary]);
  await pool.query('INSERT INTO memberships(tenant_id,user_id,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)', [ordinary,company.demo_owner_id]);
  try {
    await pool.query('UPDATE tenants SET demo_expires_at=CURRENT_TIMESTAMP-INTERVAL \'1 minute\' WHERE id=$1', [company.id]);
    cleanup();
    expect((await pool.query('SELECT id FROM "user" WHERE id=$1', [company.demo_owner_id])).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM tenants WHERE id=$1', [company.id])).rowCount).toBe(1);
  } finally {
    await pool.query('DELETE FROM memberships WHERE tenant_id=$1', [ordinary]);
    await pool.query('DELETE FROM tenants WHERE id=$1', [ordinary]);
  }
});

test("retained demo capacity is enforced without creating another account", async ({ request }) => {
  const existing = (await pool.query('SELECT count(*)::int AS count FROM tenants WHERE demo_owner_id IS NOT NULL')).rows[0].count;
  const fixtures = Array.from({ length: Math.max(0,100-existing) }, (_,index)=>`capacity-${runId}-${index}@example.test`);
  emails.push(...fixtures);
  await pool.query('INSERT INTO "user"(id,name,email,"updatedAt") SELECT gen_random_uuid()::text,\'Capacity fixture\',email,CURRENT_TIMESTAMP FROM unnest($1::text[]) email', [fixtures]);
  await pool.query('INSERT INTO tenants(name,demo_owner_id,demo_expires_at,updated_at) SELECT \'Capacity fixture\',id,CURRENT_TIMESTAMP+INTERVAL \'1 day\',CURRENT_TIMESTAMP FROM "user" WHERE email=ANY($1::text[])', [fixtures]);
  await pool.query('INSERT INTO memberships(tenant_id,user_id,role,updated_at) SELECT id,demo_owner_id,\'ADMIN\',CURRENT_TIMESTAMP FROM tenants WHERE demo_owner_id IN (SELECT id FROM "user" WHERE email=ANY($1::text[]))', [fixtures]);
  const result = await register(request, "capacity-blocked"); expect(result.response.status()).toBe(429);
  expect((await pool.query('SELECT id FROM "user" WHERE email=$1', [result.email])).rowCount).toBe(0);
});
test("signup budget persists across requests and rejects attempts before hashing", async ({ request }) => {
  const count = (await pool.query('SELECT count(*)::int AS count FROM demo_signup_attempts WHERE created_at>=CURRENT_TIMESTAMP - INTERVAL \'1 hour\'')).rows[0].count;
  const fixtureIds = Array.from({ length: Math.max(0, 20-count) }, () => randomUUID());
  for (const id of fixtureIds) { await pool.query('INSERT INTO demo_signup_attempts(id) VALUES($1)', [id]); attemptIds.add(id); }
  const blocked = await register(request, "limited"); expect(blocked.response.status()).toBe(429);
  expect(blocked.response.headers()["retry-after"]).toBe("3600");
  expect((await pool.query('SELECT id FROM "user" WHERE email=$1', [blocked.email])).rowCount).toBe(0);
});
