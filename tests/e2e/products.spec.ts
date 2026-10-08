import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";

const database = new Pool({ connectionString: process.env.DATABASE_URL });
const userId = randomUUID();
const tenantId = randomUUID();
const otherTenantId = randomUUID();
const constraintTenantId = randomUUID();
const otherProductId = randomUUID();
const membershipId = randomUUID();
const email = `products-${userId}@example.test`;
const password = "Product-tests-only-password-2026!";
const origin = "http://127.0.0.1:3100";
const api = `/api/tenants/${tenantId}/products`;
const listURL = `/tenants/${tenantId}/products`;
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

async function productCount() {
  return Number((await database.query('SELECT count(*) FROM products WHERE tenant_id=$1', [tenantId])).rows[0].count);
}

test.beforeAll(async () => {
  const connection = await database.connect();
  try {
    await connection.query("BEGIN");
    await connection.query('INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)', [userId, "Product Test User", email]);
    await connection.query('INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
      [randomUUID(), userId, "credential", userId, await hashPassword(password)]);
    for (const id of [tenantId, otherTenantId, constraintTenantId]) {
      await connection.query('INSERT INTO tenants (id,name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)', [id, "Product Test Company"]);
    }
    await connection.query("INSERT INTO memberships (id,tenant_id,user_id,role,updated_at) VALUES ($1,$2,$3,'ADMIN',CURRENT_TIMESTAMP)", [membershipId, tenantId, userId]);
    await connection.query('INSERT INTO products (id,tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,$3,$4,100,CURRENT_TIMESTAMP)', [otherProductId, otherTenantId, "PRIVATE-OTHER", "Private Other Product"]);
    await connection.query('INSERT INTO products (tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,$3,100,CURRENT_TIMESTAMP)', [constraintTenantId, "REFERENCED", "Referenced Product"]);
    await connection.query("COMMIT");
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
});

test.afterAll(async () => {
  try {
    await database.query('DELETE FROM products WHERE tenant_id=ANY($1::uuid[])', [[tenantId, otherTenantId, constraintTenantId]]);
    await database.query('DELETE FROM memberships WHERE id=$1', [membershipId]);
    await database.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])', [[tenantId, otherTenantId, constraintTenantId]]);
    await database.query('DELETE FROM "user" WHERE id=$1', [userId]);
  } finally { await database.end(); }
});


const input = (sku: string) => ({ sku, name: "Business laptop", unitPriceCents: 12999 });

test("anonymous users cannot access the product catalog", async ({ request, page }) => {
  expect((await request.get(api)).status()).toBe(401);
  expect((await request.get(`${api}/${otherProductId}`)).status()).toBe(401);
  expect((await request.post(api, { headers, data: input("DENIED") })).status()).toBe(401);
  expect((await request.put(`${api}/${otherProductId}`, { headers, data: input("DENIED") })).status()).toBe(401);
  await page.goto(listURL);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("administrators create and edit exact USD prices in the responsive interface", async ({ page }) => {
  await signIn(page);
  await page.goto(listURL);
  await expect(page.getByRole("heading", { name: "No products yet" })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("link", { name: "New product", exact: true }).click();
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Product name is required.", { exact: true })).toBeVisible();
  await page.getByLabel("SKU", { exact: true }).fill(" laptop-01 ");
  await page.getByLabel("Product name", { exact: true }).fill("  Business laptop  ");
  await page.getByLabel("Unit price (USD, excluding tax)", { exact: true }).fill("129.999");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Please correct the highlighted fields.");
  await page.getByLabel("Unit price (USD, excluding tax)", { exact: true }).fill("129.99");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("status")).toHaveText("Product created.");
  await expect(page.getByText("SKU: LAPTOP-01", { exact: true })).toBeVisible();
  await expect(page.getByText(/Unit price: \$129\.99 USD/)).toBeVisible();
  await page.getByRole("link", { name: "Edit Business laptop", exact: true }).click();
  await expect(page.getByLabel("Unit price (USD, excluding tax)", { exact: true })).toHaveValue("129.99");
  await page.getByLabel("Product name", { exact: true }).fill("Updated laptop");
  await page.getByLabel("Unit price (USD, excluding tax)", { exact: true }).fill("0.01");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Product updated.");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Updated laptop", exact: true })).toBeVisible();
  const row = (await database.query("SELECT sku,name,unit_price_cents FROM products WHERE tenant_id=$1 AND sku='LAPTOP-01'", [tenantId])).rows[0];
  expect(row).toEqual({ sku: "LAPTOP-01", name: "Updated laptop", unit_price_cents: 1 });
});

test("employees can read but cannot change products or prices", async ({ page }) => {
  await signIn(page);
  const id = randomUUID();
  await database.query("INSERT INTO products (id,tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,'EMPLOYEE-READ','Employee-visible product',100,CURRENT_TIMESTAMP)", [id, tenantId]);
  await database.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1", [membershipId]);
  try {
    expect((await page.request.get(api)).status()).toBe(200);
    expect((await page.request.get(`${api}/${id}`)).status()).toBe(200);
    expect((await page.request.post(api, { headers, data: input("EMPLOYEE-DENIED") })).status()).toBe(403);
    expect((await page.request.put(`${api}/${id}`, { headers, data: input("EMPLOYEE-DENIED") })).status()).toBe(403);
    await page.goto(listURL);
    await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "New product", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit product", exact: true })).toHaveCount(0);
    await page.goto(`${listURL}/new`);
    await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
    await page.goto(`${listURL}/${id}/edit`);
    await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
  } finally { await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1", [membershipId]); }
});

test("writes validate types, bounds, JSON and origins without side effects", async ({ page }) => {
  await signIn(page);
  const count = await productCount();
  for (const change of [{ sku: " " }, { sku: "A B" }, { sku: "X".repeat(65) }, { name: " " },
    { name: "X".repeat(201) }, { unitPriceCents: -1 }, { unitPriceCents: 1.5 },
    { unitPriceCents: 2147483648 }, { unitPriceCents: "12999" }, { tenantId: otherTenantId }, { id: randomUUID() }]) {
    expect((await page.request.post(api, { headers, data: { ...input("INVALID"), ...change } })).status()).toBe(422);
  }
  expect((await page.request.post(api, { headers: { ...headers, "Content-Type": "application/json" }, data: Buffer.from("{") })).status()).toBe(400);
  expect((await page.request.post(api, { headers: { ...headers, "Content-Type": "text/plain" }, data: "invalid" })).status()).toBe(415);
  for (const Origin of ["https://evil.example", "null", `${origin}/path`]) {
    expect((await page.request.post(api, { headers: { Origin }, data: input("BAD-ORIGIN") })).status()).toBe(403);
  }
  expect((await page.request.post(api, { data: input("NO-ORIGIN") })).status()).toBe(403);
  expect(await productCount()).toBe(count);
});

test("products remain isolated by tenant and revoked memberships lose access", async ({ page }) => {
  await signIn(page);
  const foreignApi = `/api/tenants/${otherTenantId}/products`;
  expect((await page.request.get(foreignApi)).status()).toBe(403);
  expect((await page.request.post(foreignApi, { headers, data: input("FOREIGN") })).status()).toBe(403);
  expect((await page.request.get(`${api}/${otherProductId}`)).status()).toBe(404);
  expect((await page.request.put(`${api}/${otherProductId}`, { headers, data: input("FOREIGN") })).status()).toBe(404);
  expect((await page.request.get(`${api}/invalid`)).status()).toBe(400);
  await page.goto(`${listURL}/${otherProductId}/edit`);
  await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
  await expect(page.getByText("Private Other Product")).toHaveCount(0);
  await database.query("UPDATE memberships SET is_active=false WHERE id=$1", [membershipId]);
  try {
    expect((await page.request.get(api)).status()).toBe(403);
    expect((await page.request.post(api, { headers, data: input("REVOKED") })).status()).toBe(403);
    await page.goto(listURL);
    await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
  } finally { await database.query("UPDATE memberships SET is_active=true WHERE id=$1", [membershipId]); }
});

test("SKU uniqueness is atomic, normalized and limited to one tenant", async ({ page }) => {
  await signIn(page);
  const results = await Promise.all([
    page.request.post(api, { headers, data: input(" concurrent-sku ") }),
    page.request.post(api, { headers, data: input("CONCURRENT-SKU") }),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
  const duplicate = await page.request.post(api, { headers, data: input("concurrent-sku") });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).fieldErrors.sku).toEqual(["Choose a different SKU."]);
  // A different tenant can independently own the same normalized SKU.
  await database.query("INSERT INTO products (tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,'CONCURRENT-SKU','Other company product',100,CURRENT_TIMESTAMP)", [otherTenantId]);
  const second = await page.request.post(api, { headers, data: input("SECOND-SKU") });
  expect(second.status()).toBe(201);
  const id = (await second.json()).product.id;
  expect((await page.request.put(`${api}/${id}`, { headers, data: input("CONCURRENT-SKU") })).status()).toBe(409);
  expect((await page.request.get(`${api}/${id}`)).status()).toBe(200);
  expect((await page.request.get(`${api}/${id}`)).headers()["cache-control"]).toBe("private, no-store");
  expect((await page.request.delete(`${api}/${id}`, { headers })).status()).toBe(405);
  expect((await page.request.get(`${api}/${id}`)).status()).toBe(200);
});

test("catalog pagination follows stable name and identifier ordering", async ({ page }) => {
  await signIn(page);
  for (let n = 0; n < 23; n++) {
    await database.query("INSERT INTO products (tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,'Paging product',0,CURRENT_TIMESTAMP)", [tenantId, `PAGE-${n}`]);
  }
  const firstResponse = await page.request.get(api);
  expect(firstResponse.status()).toBe(200);
  const first = await firstResponse.json();
  const second = await (await page.request.get(`${api}?page=2`)).json();
  expect(first.products).toHaveLength(20);
  expect(first.hasNextPage).toBe(true);
  expect(second.hasNextPage).toBe(false);
  const expected = (await database.query("SELECT id FROM products WHERE tenant_id=$1 ORDER BY name,id", [tenantId])).rows.map((r) => r.id);
  expect([...first.products, ...second.products].map((r: { id: string }) => r.id)).toEqual(expected);
  for (const query of ["page=0", "page=-1", "page=1.5", "page=10000", "page=1&page=2"]) {
    expect((await page.request.get(`${api}?${query}`)).status()).toBe(400);
  }
  await page.goto(listURL);
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Previous page" }).click();
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
});

test("database constraints reject invalid direct writes and referenced tenant deletion", async () => {
  for (const [sku, name, price, constraint] of [
    ["lowercase", "Valid", 0, "products_sku_format"],
    ["BLANK-NAME", " ", 0, "products_name_not_blank"],
    ["NEGATIVE", "Valid", -1, "products_unit_price_non_negative"],
  ] as const) {
    await expect(database.query("INSERT INTO products (tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)", [tenantId, sku, name, price]))
      .rejects.toMatchObject({ code: "23514", constraint });
  }
  await expect(database.query("INSERT INTO products (tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,'MISSING','Valid',0,CURRENT_TIMESTAMP)", [randomUUID()]))
    .rejects.toMatchObject({ code: "23503", constraint: "products_tenant_id_fkey" });
  await expect(database.query("DELETE FROM tenants WHERE id=$1", [constraintTenantId]))
    .rejects.toMatchObject({ code: "23001", constraint: "products_tenant_id_fkey" });
});

test("forms preserve values and recover from SKU conflicts and network failures", async ({ page }) => {
  await signIn(page);
  await database.query("INSERT INTO products (tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,'FORM-CONFLICT','Existing product',100,CURRENT_TIMESTAMP)", [tenantId]);
  await page.goto(`${listURL}/new`);
  await page.getByLabel("SKU", { exact: true }).fill("FORM-CONFLICT");
  await page.getByLabel("Product name", { exact: true }).fill("Retained product");
  await page.getByLabel("Unit price (USD, excluding tax)", { exact: true }).fill("12.34");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("This SKU is already used by a product in this company.");
  await expect(page.getByText("Choose a different SKU.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue("Retained product");
  await page.route(`**${api}`, (route) => route.abort());
  await page.getByLabel("SKU", { exact: true }).fill("NETWORK-FAILURE");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Unable to reach the server. Please try again.");
  await expect(page.getByLabel("Unit price (USD, excluding tax)", { exact: true })).toHaveValue("12.34");
  await expect(page.getByRole("button", { name: "Create product" })).toBeEnabled();
});

test("role demotion waits for an authorized product write to finish", async ({ page }) => {
  await signIn(page);
  const gate = await database.connect();
  const revoker = await database.connect();
  const lockKey = 117934;
  let write: ReturnType<typeof page.request.post> | undefined;
  let revoke: Promise<unknown> | undefined;
  let triggerCreated = false;
  let functionCreated = false;
  try {
    await gate.query('SELECT pg_advisory_lock($1)', [lockKey]);
    await database.query(`CREATE FUNCTION pause_product_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.name = 'Concurrent product' THEN
          PERFORM pg_advisory_xact_lock(${lockKey});
        END IF;
        RETURN NEW;
      END $$`);
    functionCreated = true;
    await database.query('CREATE TRIGGER pause_product_write BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION pause_product_write()');
    triggerCreated = true;
    write = page.request.post(api, { headers, data: { ...input("ROLE-LOCK"), name: "Concurrent product" } });
    await expect.poll(async () => Number((await database.query(
      "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND granted=false", [lockKey],
    )).rows[0].count)).toBe(1);

    revoke = revoker.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1", [membershipId]);
    await expect.poll(async () => Number((await database.query(
      "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE memberships SET role=%'",
    )).rows[0].count)).toBe(1);
    await gate.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    expect((await write).status()).toBe(201);
    await revoke;
    expect((await page.request.post(api, { headers, data: input("DENIED-AFTER-DEMOTION") })).status()).toBe(403);
  } finally {
    await gate.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    await Promise.allSettled([write, revoke]);
    gate.release();
    revoker.release();
    if (triggerCreated) await database.query('DROP TRIGGER pause_product_write ON products');
    if (functionCreated) await database.query('DROP FUNCTION pause_product_write()');
    await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1", [membershipId]);
  }
});
