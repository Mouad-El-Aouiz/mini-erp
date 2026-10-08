import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";

const database = new Pool({ connectionString: process.env.DATABASE_URL });
const userId = randomUUID();
const tenantId = randomUUID();
const otherTenantId = randomUUID();
const constraintTenantId = randomUUID();
const otherCustomerId = randomUUID();
const membershipId = randomUUID();
const email = `customers-${userId}@example.test`;
const password = "Customer-tests-only-password-2026!";
const origin = "http://127.0.0.1:3100";
const api = `/api/tenants/${tenantId}/customers`;
const listURL = `/tenants/${tenantId}/customers`;
const headers = { Origin: origin };

async function signIn(page: Page) {
  const submit = () => page.request.post("/api/auth/sign-in/email", { headers, data: { email, password } });
  let response = await submit();
  if (response.status() === 429) {
    const delay = Number(response.headers()["x-retry-after"] ?? response.headers()["retry-after"]);
    expect(Number.isFinite(delay) && delay >= 0 && delay <= 10).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, (delay + 1) * 1000));
    response = await submit();
  }
  expect(response.status()).toBe(200);
}

async function customerCount() {
  return Number((await database.query('SELECT count(*) FROM customers WHERE tenant_id=$1', [tenantId])).rows[0].count);
}

test.beforeAll(async () => {
  const connection = await database.connect();
  try {
    await connection.query("BEGIN");
    await connection.query('INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)', [userId, "Customer Test User", email]);
    await connection.query('INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
      [randomUUID(), userId, "credential", userId, await hashPassword(password)]);
    for (const id of [tenantId, otherTenantId, constraintTenantId]) {
      await connection.query('INSERT INTO tenants (id,name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)', [id, "Customer Test Company"]);
    }
    await connection.query("INSERT INTO memberships (id,tenant_id,user_id,role,updated_at) VALUES ($1,$2,$3,'EMPLOYEE',CURRENT_TIMESTAMP)", [membershipId, tenantId, userId]);
    await connection.query('INSERT INTO customers (id,tenant_id,company_name,updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)', [otherCustomerId, otherTenantId, "Private Other Customer"]);
    await connection.query('INSERT INTO customers (tenant_id,company_name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)', [constraintTenantId, "Referenced Customer"]);
    await connection.query("COMMIT");
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
});

test.afterAll(async () => {
  try {
    await database.query('DELETE FROM customers WHERE tenant_id=ANY($1::uuid[])', [[tenantId, otherTenantId, constraintTenantId]]);
    await database.query('DELETE FROM memberships WHERE id=$1', [membershipId]);
    await database.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])', [[tenantId, otherTenantId, constraintTenantId]]);
    await database.query('DELETE FROM "user" WHERE id=$1', [userId]);
  } finally { await database.end(); }
});

test("anonymous users cannot read or write customers", async ({ request, page }) => {
  expect((await request.get(api)).status()).toBe(401);
  expect((await request.get(`${api}/${otherCustomerId}`)).status()).toBe(401);
  expect((await request.post(api, { headers, data: { companyName: "Denied" } })).status()).toBe(401);
  expect((await request.put(`${api}/${otherCustomerId}`, { headers, data: { companyName: "Denied" } })).status()).toBe(401);
  await page.goto(listURL);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("employees can create and edit customers through the responsive interface", async ({ page }) => {
  await signIn(page);
  await page.goto(listURL);
  await expect(page.getByRole("heading", { name: "No customers yet" })).toBeVisible();
  await expect(page.getByText("Company: Customer Test Company", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("link", { name: "New customer", exact: true }).click();
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByText("Company name is required.", { exact: true })).toBeVisible();
  await page.getByLabel("Company name", { exact: true }).fill("  Atlas Client  ");
  await page.getByLabel("Contact name", { exact: true }).fill("Jane Smith");
  await page.getByLabel("Email", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("buyer@example.com");
  await page.getByLabel("Phone", { exact: true }).fill("+212 0612 345678");
  await page.getByLabel("Address", { exact: true }).fill("10 Business Street");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("status")).toHaveText("Customer created.");
  await expect(page.getByRole("heading", { name: "Atlas Client", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit Atlas Client", exact: true }).click();
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("+212 0612 345678");
  await page.getByLabel("Company name", { exact: true }).fill("Atlas Client Updated");
  await page.getByLabel("Contact name", { exact: true }).fill("");
  await page.getByLabel("Email", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Customer updated.");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Atlas Client Updated", exact: true })).toBeVisible();
  const result = await database.query('SELECT contact_name,email,phone FROM customers WHERE tenant_id=$1 AND company_name=$2', [tenantId, "Atlas Client Updated"]);
  expect(result.rows[0]).toEqual({ contact_name: null, email: null, phone: "+212 0612 345678" });
});

test("customer writes reject invalid data, JSON and untrusted origins without side effects", async ({ page }) => {
  await signIn(page);
  const count = await customerCount();
  for (const data of [
    { companyName: " " }, { companyName: "Valid", email: "invalid" },
    { companyName: "Valid", phone: 123 }, { companyName: "a".repeat(201) },
    { companyName: "Valid", tenantId: otherTenantId }, { companyName: "Valid", id: randomUUID() },
  ]) {
    const response = await page.request.post(api, { headers, data });
    expect(response.status()).toBe(422);
    expect((await response.json()).error).toBe("Invalid customer data.");
  }
  expect((await page.request.post(api, { headers: { ...headers, "Content-Type": "application/json" }, data: Buffer.from("{") })).status()).toBe(400);
  expect((await page.request.post(api, { headers: { ...headers, "Content-Type": "text/plain" }, data: "hello" })).status()).toBe(415);
  for (const suppliedOrigin of ["https://evil.example", "null", `${origin}/path`]) {
    expect((await page.request.post(api, { headers: { Origin: suppliedOrigin }, data: { companyName: "Denied" } })).status()).toBe(403);
  }
  expect((await page.request.post(api, { data: { companyName: "Denied" } })).status()).toBe(403);
  expect(await customerCount()).toBe(count);
});

test("customer reads and updates remain isolated between companies", async ({ page }) => {
  await signIn(page);
  const otherApi = `/api/tenants/${otherTenantId}/customers`;
  expect((await page.request.get(otherApi)).status()).toBe(403);
  expect((await page.request.post(otherApi, { headers, data: { companyName: "Denied" } })).status()).toBe(403);
  expect((await page.request.get(`${api}/${otherCustomerId}`)).status()).toBe(404);
  expect((await page.request.put(`${api}/${otherCustomerId}`, { headers, data: { companyName: "Denied" } })).status()).toBe(404);
  expect((await page.request.put(`${otherApi}/${otherCustomerId}`, { headers, data: { companyName: "Denied" } })).status()).toBe(403);
  expect((await page.request.get(`${api}/not-a-uuid`)).status()).toBe(400);
  expect((await page.request.get(`${api}/${randomUUID()}`)).status()).toBe(404);
  await page.goto(`${listURL}/${otherCustomerId}/edit`);
  await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
  await expect(page.getByText("Private Other Customer", { exact: true })).toHaveCount(0);
  expect((await database.query('SELECT company_name FROM customers WHERE id=$1', [otherCustomerId])).rows[0].company_name).toBe("Private Other Customer");
});

test("customer writes allow duplicate names and PUT replaces the full form", async ({ page }) => {
  await signIn(page);
  const first = await page.request.post(api, { headers, data: { companyName: "Repeated Name", email: "buyer@example.com" } });
  const second = await page.request.post(api, { headers, data: { companyName: "Repeated Name" } });
  expect(first.status()).toBe(201);
  expect(second.status()).toBe(201);
  const firstCustomer = (await first.json()).customer;
  expect((await second.json()).customer.id).not.toBe(firstCustomer.id);
  const replaced = await page.request.put(`${api}/${firstCustomer.id}`, { headers, data: { companyName: "Repeated Name" } });
  expect(replaced.status()).toBe(200);
  expect((await replaced.json()).customer.email).toBeNull();
  expect((await page.request.put(`${api}/${firstCustomer.id}`, { headers, data: { phone: "123" } })).status()).toBe(422);
  expect((await page.request.put(`${api}/${firstCustomer.id}`, { headers: { Origin: "https://evil.example" }, data: { companyName: "Denied" } })).status()).toBe(403);
  expect((await page.request.delete(`${api}/${firstCustomer.id}`, { headers })).status()).toBe(405);
});

test("revoked membership blocks customer access with an existing session", async ({ page }) => {
  await signIn(page);
  const count = await customerCount();
  await database.query('UPDATE memberships SET is_active=false WHERE id=$1', [membershipId]);
  try {
    expect((await page.request.get(api)).status()).toBe(403);
    expect((await page.request.post(api, { headers, data: { companyName: "Denied" } })).status()).toBe(403);
    expect((await page.request.put(`${api}/${otherCustomerId}`, { headers, data: { companyName: "Denied" } })).status()).toBe(403);
    await page.goto(`${listURL}/new`);
    await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
    expect(await customerCount()).toBe(count);
  } finally { await database.query('UPDATE memberships SET is_active=true WHERE id=$1', [membershipId]); }
});

test("administrators can create customers and pagination is bounded and stable", async ({ page }) => {
  await signIn(page);
  await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1", [membershipId]);
  expect((await page.request.post(api, { headers, data: { companyName: "Administrator Customer" } })).status()).toBe(201);
  for (let index = 0; index < 23; index++) {
    await database.query('INSERT INTO customers (tenant_id,company_name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)', [tenantId, "Paging Customer"]);
  }
  const expected = (await database.query('SELECT id FROM customers WHERE tenant_id=$1 ORDER BY company_name,id', [tenantId])).rows.map((row) => row.id);
  const first = await page.request.get(api);
  expect(first.headers()["cache-control"]).toBe("private, no-store");
  const firstPage = await first.json();
  const secondPage = await (await page.request.get(`${api}?page=2`)).json();
  expect(firstPage.customers).toHaveLength(20);
  expect(firstPage.hasNextPage).toBe(true);
  expect(secondPage.hasNextPage).toBe(false);
  expect([...firstPage.customers, ...secondPage.customers].map((customer: { id: string }) => customer.id)).toEqual(expected);
  for (const query of ["page=0", "page=-1", "page=1.5", "page=10000", "page=x", "page=1&page=2"]) {
    expect((await page.request.get(`${api}?${query}`)).status()).toBe(400);
  }
  await page.goto(listURL);
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(`${listURL}?page=2`);
  await expect(page.getByRole("link", { name: "Previous page", exact: true })).toBeVisible();
});

test("SQL constraints reject blank names, missing tenants and referenced tenant deletion", async () => {
  for (const name of ["", " \t\n"]) {
    await expect(database.query('INSERT INTO customers (tenant_id,company_name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)', [tenantId, name]))
      .rejects.toMatchObject({ code: "23514", constraint: "customers_company_name_not_blank" });
  }
  await expect(database.query('INSERT INTO customers (tenant_id,company_name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)', [randomUUID(), "Missing Tenant"]))
    .rejects.toMatchObject({ code: "23503", constraint: "customers_tenant_id_fkey" });
  await expect(database.query('DELETE FROM tenants WHERE id=$1', [constraintTenantId]))
    .rejects.toMatchObject({ code: "23001", constraint: "customers_tenant_id_fkey" });
});


test("customer forms preserve values after server and network errors", async ({ page }) => {
  await signIn(page);
  await page.goto(`${listURL}/new`);
  await page.getByLabel("Company name", { exact: true }).fill("Unsaved Customer");
  const pattern = `**/api/tenants/${tenantId}/customers`;
  await page.route(pattern, (route) => route.fulfill({
    status: 403, contentType: "application/json", body: JSON.stringify({ error: "Access denied." }),
  }));
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Access denied.");
  await expect(page.getByLabel("Company name", { exact: true })).toHaveValue("Unsaved Customer");
  await page.unroute(pattern);
  await page.route(pattern, (route) => route.abort());
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Unable to reach the server. Please try again.");
  await expect(page.getByRole("button", { name: "Create customer" })).toBeEnabled();
  await expect(page.getByLabel("Company name", { exact: true })).toHaveValue("Unsaved Customer");
});

test("membership revocation waits for an authorized customer write to finish", async ({ page }) => {
  await signIn(page);
  const gate = await database.connect();
  const revoker = await database.connect();
  const lockKey = 117933;
  let write: ReturnType<typeof page.request.post> | undefined;
  let revoke: Promise<unknown> | undefined;
  let triggerCreated = false;
  let functionCreated = false;
  try {
    await gate.query('SELECT pg_advisory_lock($1)', [lockKey]);
    await database.query(`CREATE FUNCTION pause_customer_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.company_name = 'Concurrent customer' THEN
          PERFORM pg_advisory_xact_lock(${lockKey});
        END IF;
        RETURN NEW;
      END $$`);
    functionCreated = true;
    await database.query('CREATE TRIGGER pause_customer_write BEFORE INSERT ON customers FOR EACH ROW EXECUTE FUNCTION pause_customer_write()');
    triggerCreated = true;
    write = page.request.post(api, { headers, data: { companyName: "Concurrent customer" } });
    await expect.poll(async () => Number((await database.query(
      "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND granted=false", [lockKey],
    )).rows[0].count)).toBe(1);

    revoke = revoker.query('UPDATE memberships SET is_active=false WHERE id=$1', [membershipId]);
    await expect.poll(async () => Number((await database.query(
      "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE memberships SET is_active=false%'",
    )).rows[0].count)).toBe(1);
    await gate.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    expect((await write).status()).toBe(201);
    await revoke;
    expect((await page.request.post(api, { headers, data: { companyName: "Denied after revocation" } })).status()).toBe(403);
  } finally {
    await gate.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    await Promise.allSettled([write, revoke]);
    gate.release();
    revoker.release();
    if (triggerCreated) await database.query('DROP TRIGGER pause_customer_write ON customers');
    if (functionCreated) await database.query('DROP FUNCTION pause_customer_write()');
    await database.query('UPDATE memberships SET is_active=true WHERE id=$1', [membershipId]);
  }
});
