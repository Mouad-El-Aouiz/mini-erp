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
const email = `inventory-${userId}@example.test`;
const password = "Product-tests-only-password-2026!";
const origin = "http://127.0.0.1:3100";
const api = `/api/tenants/${tenantId}/inventory`;
const listURL = `/tenants/${tenantId}/inventory`;
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


test.beforeAll(async () => {
  const connection = await database.connect();
  try {
    await connection.query("BEGIN");
    await connection.query('INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)', [userId, "Inventory Test User", email]);
    await connection.query('INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
      [randomUUID(), userId, "credential", userId, await hashPassword(password)]);
    for (const id of [tenantId, otherTenantId, constraintTenantId]) {
      await connection.query('INSERT INTO tenants (id,name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)', [id, "Inventory Test Company"]);
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
    await database.query('DELETE FROM stock_movements WHERE tenant_id=ANY($1::uuid[])', [[tenantId, otherTenantId, constraintTenantId]]);
    await database.query('DELETE FROM products WHERE tenant_id=ANY($1::uuid[])', [[tenantId, otherTenantId, constraintTenantId]]);
    await database.query('DELETE FROM memberships WHERE id=$1', [membershipId]);
    await database.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])', [[tenantId, otherTenantId, constraintTenantId]]);
    await database.query('DELETE FROM "user" WHERE id=$1', [userId]);
  } finally { await database.end(); }
});



const movementsApi = (id: string) => `${api}/${id}/movements`;
const adjustment = (quantityDelta: number, reason = "Test adjustment", requestId = randomUUID()) => ({ quantityDelta, reason, requestId });
async function createProduct(page: Page, name = "Stock test product") {
  const response = await page.request.post(`/api/tenants/${tenantId}/products`, { headers,
    data: { sku: `STOCK-${randomUUID()}`, name, unitPriceCents: 100 } });
  expect(response.status()).toBe(201);
  return (await response.json()).product.id as string;
}
async function balance(id: string) {
  return (await database.query("SELECT physical_quantity FROM inventory_balances WHERE tenant_id=$1 AND product_id=$2", [tenantId, id])).rows[0]?.physical_quantity ?? 0;
}
async function countMovements(id: string) {
  return Number((await database.query("SELECT count(*) FROM stock_movements WHERE tenant_id=$1 AND product_id=$2", [tenantId, id])).rows[0].count);
}

test("anonymous users cannot access inventory or record movements", async ({ request, page }) => {
  expect((await request.get(api)).status()).toBe(401);
  expect((await request.get(movementsApi(otherProductId))).status()).toBe(401);
  expect((await request.post(movementsApi(otherProductId), { headers, data: adjustment(1) })).status()).toBe(401);
  await page.goto(listURL);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("administrators record receipts and corrections through a responsive form", async ({ page }) => {
  await signIn(page);
  const id = await createProduct(page, "Business stock laptop");
  expect(await balance(id)).toBe(0);
  expect((await database.query("SELECT count(*) FROM inventory_balances WHERE tenant_id=$1 AND product_id=$2", [tenantId,id])).rows[0].count).toBe("1");
  await page.setViewportSize({ width:375, height:812 });
  await page.goto(`${listURL}/${id}`);
  await page.getByRole("button", { name: "Record adjustment" }).click();
  await expect(page.getByText("A reason is required.", { exact:true })).toBeVisible();
  await page.getByLabel("Quantity change", { exact:true }).fill("10");
  await page.getByLabel("Reason", { exact:true }).fill("  Initial delivery  ");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name:"Record adjustment" }).click();
  await expect(page.getByText("Physical quantity: 10", { exact:true })).toBeVisible();
  await expect(page.getByText("Reason: Initial delivery", { exact:true })).toBeVisible();
  await expect(page.getByText("Recorded by: Inventory Test User", { exact:true })).toBeVisible();
  await page.getByLabel("Quantity change", { exact:true }).fill("-2");
  await page.getByLabel("Reason", { exact:true }).fill("Damaged units");
  await page.getByRole("button", { name:"Record adjustment" }).click();
  await expect(page.getByText("Physical quantity: 8", { exact:true })).toBeVisible();
  await page.getByLabel("Quantity change", { exact:true }).fill("-9");
  await page.getByLabel("Reason", { exact:true }).fill("Too many units");
  await page.getByRole("button", { name:"Record adjustment" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Adjustment would make physical stock negative.");
  await expect(page.getByLabel("Quantity change", { exact:true })).toHaveValue("-9");
  expect(await balance(id)).toBe(8); expect(await countMovements(id)).toBe(2);
  expect((await database.query("SELECT sum(quantity_delta) AS total FROM stock_movements WHERE tenant_id=$1 AND product_id=$2", [tenantId,id])).rows[0].total).toBe("8");
});

test("employees can consult stock and history but cannot adjust it", async ({ page }) => {
  await signIn(page); const id = await createProduct(page);
  expect((await page.request.post(movementsApi(id), { headers, data: adjustment(4) })).status()).toBe(201);
  await database.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1", [membershipId]);
  try {
    expect((await page.request.get(api)).status()).toBe(200);
    expect((await page.request.get(movementsApi(id))).status()).toBe(200);
    expect((await page.request.post(movementsApi(id), { headers, data: adjustment(1) })).status()).toBe(403);
    await page.goto(`${listURL}/${id}`);
    await expect(page.getByText("Physical quantity: 4", { exact:true })).toBeVisible();
    await expect(page.getByRole("button", { name:"Record adjustment" })).toHaveCount(0);
    expect(await balance(id)).toBe(4);
  } finally { await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1", [membershipId]); }
});

test("invalid inputs, JSON, origins and page parameters cannot change stock", async ({ page }) => {
  await signIn(page); const id = await createProduct(page); const url = movementsApi(id);
  for (const change of [{ quantityDelta:0 }, { quantityDelta:1.5 }, { quantityDelta:"10" }, { quantityDelta:2147483648 },
    { reason:" " }, { reason:"X".repeat(501) }, { requestId:"invalid" }, { tenantId:otherTenantId }, { recordedByMembershipId:membershipId }]) {
    expect((await page.request.post(url, { headers, data:{...adjustment(1),...change} })).status()).toBe(422);
  }
  expect((await page.request.post(url, { headers:{...headers,"Content-Type":"application/json"}, data:Buffer.from("{") })).status()).toBe(400);
  expect((await page.request.post(url, { headers:{...headers,"Content-Type":"text/plain"}, data:"bad" })).status()).toBe(415);
  expect((await page.request.post(url, { data:adjustment(1) })).status()).toBe(403);
  expect((await page.request.post(url, { headers:{Origin:"https://evil.example"}, data:adjustment(1) })).status()).toBe(403);
  for (const query of ["page=0","page=1.5","page=10000","page=1&page=2"]) {
    expect((await page.request.get(`${api}?${query}`)).status()).toBe(400);
    expect((await page.request.get(`${url}?${query}`)).status()).toBe(400);
  }
  expect((await page.request.get(movementsApi("invalid"))).status()).toBe(400);
  expect((await page.request.put(url, { headers, data:adjustment(1) })).status()).toBe(405);
  expect((await page.request.delete(url, { headers })).status()).toBe(405);
  expect(await balance(id)).toBe(0); expect(await countMovements(id)).toBe(0);
});

test("tenant isolation and revoked memberships apply to inventory", async ({ page }) => {
  await signIn(page); const id = await createProduct(page);
  expect((await page.request.get(`/api/tenants/${otherTenantId}/inventory`)).status()).toBe(403);
  expect((await page.request.get(movementsApi(otherProductId))).status()).toBe(404);
  expect((await page.request.post(movementsApi(otherProductId), { headers, data:adjustment(1) })).status()).toBe(404);
  await page.goto(`${listURL}/${otherProductId}`);
  await expect(page.getByRole("heading",{name:"Workspace unavailable"})).toBeVisible();
  await database.query("UPDATE memberships SET is_active=false WHERE id=$1",[membershipId]);
  try {
    expect((await page.request.get(api)).status()).toBe(403);
    expect((await page.request.get(movementsApi(id))).status()).toBe(403);
    expect((await page.request.post(movementsApi(id), { headers, data:adjustment(1) })).status()).toBe(403);
  } finally { await database.query("UPDATE memberships SET is_active=true WHERE id=$1",[membershipId]); }
});

test("the same adjustment identifier is applied once even with concurrent retries", async ({ page }) => {
  await signIn(page); const id = await createProduct(page); const data = adjustment(5,"Receipt");
  const responses = await Promise.all([page.request.post(movementsApi(id),{headers,data}), page.request.post(movementsApi(id),{headers,data})]);
  expect(responses.map(r=>r.status()).sort()).toEqual([200,201]);
  const records = await Promise.all(responses.map(r=>r.json()));
  expect(records[0].movement.id).toBe(records[1].movement.id);
  expect(await balance(id)).toBe(5); expect(await countMovements(id)).toBe(1);
  expect((await page.request.post(movementsApi(id.toUpperCase()),{headers,data:{...data,requestId:data.requestId.toUpperCase()}})).status()).toBe(200);
  expect((await page.request.post(movementsApi(id),{headers,data:{...data,quantityDelta:6}})).status()).toBe(409);
  const other = await createProduct(page);
  expect((await page.request.post(movementsApi(other),{headers,data})).status()).toBe(409);
  expect(await balance(other)).toBe(0);
});

test("concurrent additions preserve every movement and withdrawals cannot oversell", async ({ page }) => {
  await signIn(page); const id = await createProduct(page);
  const adds = await Promise.all(Array.from({length:6},()=>page.request.post(movementsApi(id),{headers,data:adjustment(1)})));
  expect(adds.map(r=>r.status())).toEqual(Array(6).fill(201)); expect(await balance(id)).toBe(6);
  const removes = await Promise.all(Array.from({length:2},()=>page.request.post(movementsApi(id),{headers,data:adjustment(-4)})));
  expect(removes.map(r=>r.status()).sort()).toEqual([201,409]);
  expect(await balance(id)).toBe(2); expect(await countMovements(id)).toBe(7);
});

test("overflow and insufficient stock are rejected without recording movements", async ({ page }) => {
  await signIn(page); const id = await createProduct(page);
  expect((await page.request.post(movementsApi(id),{headers,data:adjustment(-1)})).status()).toBe(409);
  expect((await page.request.post(movementsApi(id),{headers,data:adjustment(2147483647)})).status()).toBe(201);
  expect((await page.request.post(movementsApi(id),{headers,data:adjustment(1)})).status()).toBe(409);
  expect(await balance(id)).toBe(2147483647); expect(await countMovements(id)).toBe(1);
});

test("movement creation failure rolls back the balance change", async ({ page }) => {
  await signIn(page); const id = await createProduct(page);
  await database.query(`CREATE FUNCTION fail_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.reason='Forced rollback' THEN RAISE EXCEPTION 'Forced test failure'; END IF; RETURN NEW; END $$`);
  try {
    await database.query("CREATE TRIGGER fail_stock_movement BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION fail_stock_movement()");
    try {
      expect((await page.request.post(movementsApi(id),{headers,data:adjustment(3,"Forced rollback")})).status()).toBe(500);
      expect(await balance(id)).toBe(0); expect(await countMovements(id)).toBe(0);
    } finally { await database.query("DROP TRIGGER fail_stock_movement ON stock_movements"); }
  } finally { await database.query("DROP FUNCTION fail_stock_movement()"); }
});

test("SQL constraints enforce tenant-safe relationships and preserve actor references", async ({ page }) => {
  await signIn(page); const id = await createProduct(page);
  await expect(database.query("UPDATE inventory_balances SET physical_quantity=-1 WHERE tenant_id=$1 AND product_id=$2",[tenantId,id])).rejects.toMatchObject({code:"23514",constraint:"inventory_physical_non_negative"});
  const sql="INSERT INTO stock_movements (tenant_id,product_id,request_id,quantity_delta,reason,recorded_by_membership_id) VALUES ($1,$2,$3,$4,$5,$6)";
  for (const [delta,reason,constraint] of [[0,"Reason","stock_movements_delta_non_zero"],[1," ","stock_movements_reason_valid"]] as const) {
    await expect(database.query(sql,[tenantId,id,randomUUID(),delta,reason,membershipId])).rejects.toMatchObject({code:"23514",constraint});
  }
  await expect(database.query(sql,[tenantId,otherProductId,randomUUID(),1,"Cross tenant product",membershipId])).rejects.toMatchObject({code:"23503"});
  await expect(database.query(sql,[otherTenantId,otherProductId,randomUUID(),1,"Cross tenant actor",membershipId])).rejects.toMatchObject({code:"23503"});
  expect((await page.request.post(movementsApi(id),{headers,data:adjustment(1)})).status()).toBe(201);
  await expect(database.query("DELETE FROM memberships WHERE id=$1",[membershipId])).rejects.toMatchObject({code:"23001"});
  await expect(database.query("DELETE FROM products WHERE id=$1",[id])).rejects.toMatchObject({code:"23001"});
});

test("a lost successful response can be retried from the form without duplicating stock", async ({ page }) => {
  await signIn(page); const id = await createProduct(page);
  await page.goto(`${listURL}/${id}`);
  await page.getByLabel("Quantity change",{exact:true}).fill("5");
  await page.getByLabel("Reason",{exact:true}).fill("Network recovery");
  const pattern=`**${movementsApi(id)}`;
  let firstId: string | undefined;
  await page.route(pattern,async route=>{
    firstId=route.request().postDataJSON().requestId;
    const response=await route.fetch(); expect(response.status()).toBe(201);
    await route.abort();
  });
  await page.getByRole("button",{name:"Record adjustment"}).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Keep the same values and retry");
  expect(await balance(id)).toBe(5);
  await page.unroute(pattern);
  const responsePromise=page.waitForResponse(r=>r.url().endsWith(movementsApi(id)) && r.request().method()==="POST");
  await page.getByRole("button",{name:"Record adjustment"}).click();
  const response=await responsePromise;
  expect(response.status()).toBe(200); expect(response.request().postDataJSON().requestId).toBe(firstId);
  await expect(page.getByText("Physical quantity: 5",{exact:true})).toBeVisible();
  expect(await countMovements(id)).toBe(1);
});

test("inventory and movement pages are bounded and follow stable ordering", async ({ page }) => {
  await signIn(page); const id = await createProduct(page,"Pagination product");
  for(let n=0;n<23;n++) expect((await page.request.post(movementsApi(id),{headers,data:adjustment(1,`Receipt ${n}`)})).status()).toBe(201);
  const firstResponse=await page.request.get(movementsApi(id)); expect(firstResponse.headers()["cache-control"]).toBe("private, no-store");
  const first=await firstResponse.json(); const second=await (await page.request.get(`${movementsApi(id)}?page=2`)).json();
  expect(first.movements).toHaveLength(20); expect(first.hasNextPage).toBe(true); expect(second.movements).toHaveLength(3);
  const expected=(await database.query("SELECT id FROM stock_movements WHERE tenant_id=$1 AND product_id=$2 ORDER BY created_at DESC,id DESC",[tenantId,id])).rows.map(r=>r.id);
  expect([...first.movements,...second.movements].map((r:{id:string})=>r.id)).toEqual(expected);
  await page.goto(`${listURL}/${id}`); await page.getByRole("link",{name:"Next page",exact:true}).click();
  await expect(page.getByText("Page 2",{exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Previous page",exact:true}).click(); await expect(page.getByText("Page 1",{exact:true})).toBeVisible();
  for(let n=0;n<23;n++) await createProduct(page,`Inventory paging ${n}`);
  const a=await (await page.request.get(api)).json(), b=await (await page.request.get(`${api}?page=2`)).json();
  expect(a.inventory).toHaveLength(20); expect(a.hasNextPage).toBe(true);
  const ordered=(await database.query("SELECT id FROM products WHERE tenant_id=$1 ORDER BY name,id",[tenantId])).rows.map(r=>r.id);
  expect([...a.inventory,...b.inventory].map((r:{id:string})=>r.id)).toEqual(ordered);
});
