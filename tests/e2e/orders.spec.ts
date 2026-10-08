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
const email = `orders-${userId}@example.test`;
const password = "Product-tests-only-password-2026!";
const origin = "http://127.0.0.1:3100";
const api = `/api/tenants/${tenantId}/orders`;
const listURL = `/tenants/${tenantId}/orders`;
const headers = { Origin: origin };
const customerId=randomUUID(),secondCustomerId=randomUUID(),foreignCustomerId=randomUUID();
const productId=randomUUID(),cableId=randomUUID(),foreignMembershipId=randomUUID();

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
    await connection.query('INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)', [userId, "Order Test User", email]);
    await connection.query('INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
      [randomUUID(), userId, "credential", userId, await hashPassword(password)]);
    for (const id of [tenantId, otherTenantId, constraintTenantId]) {
      await connection.query('INSERT INTO tenants (id,name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)', [id, "Order Test Company"]);
    }
    await connection.query("INSERT INTO memberships (id,tenant_id,user_id,role,updated_at) VALUES ($1,$2,$3,'EMPLOYEE',CURRENT_TIMESTAMP)", [membershipId, tenantId, userId]);
    await connection.query('INSERT INTO products (id,tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,$3,$4,100,CURRENT_TIMESTAMP)', [otherProductId, otherTenantId, "PRIVATE-OTHER", "Private Other Product"]);
    await connection.query('INSERT INTO products (tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,$3,100,CURRENT_TIMESTAMP)', [constraintTenantId, "REFERENCED", "Referenced Product"]);
    await connection.query("INSERT INTO memberships (id,tenant_id,user_id,role,is_active,updated_at) VALUES ($1,$2,$3,'EMPLOYEE',false,CURRENT_TIMESTAMP)",[foreignMembershipId,otherTenantId,userId]);
    for(const [id,tenant,name] of [[customerId,tenantId,"Order Client"],[secondCustomerId,tenantId,"Second Order Client"],[foreignCustomerId,otherTenantId,"Private foreign client"]]) {
      await connection.query("INSERT INTO customers (id,tenant_id,company_name,updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)",[id,tenant,name]);
    }
    for(const [id,sku,name,price] of [[productId,"ORDER-LAPTOP","Order laptop",12999],[cableId,"ORDER-CABLE","Order cable",5]]) {
      await connection.query("INSERT INTO products (id,tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)",[id,tenantId,sku,name,price]);
      await connection.query("INSERT INTO inventory_balances (tenant_id,product_id,physical_quantity,updated_at) VALUES ($1,$2,8,CURRENT_TIMESTAMP)",[tenantId,id]);
    }
    await connection.query("COMMIT");
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
});

test.afterAll(async () => {
  try {
    await database.query('DELETE FROM order_items WHERE tenant_id=ANY($1::uuid[])', [[tenantId,otherTenantId,constraintTenantId]]);
    await database.query('DELETE FROM orders WHERE tenant_id=ANY($1::uuid[])', [[tenantId,otherTenantId,constraintTenantId]]);
    await database.query('DELETE FROM customers WHERE tenant_id=ANY($1::uuid[])', [[tenantId,otherTenantId,constraintTenantId]]);
    await database.query('DELETE FROM stock_movements WHERE tenant_id=ANY($1::uuid[])', [[tenantId, otherTenantId, constraintTenantId]]);
    await database.query('DELETE FROM products WHERE tenant_id=ANY($1::uuid[])', [[tenantId, otherTenantId, constraintTenantId]]);
    await database.query('DELETE FROM memberships WHERE tenant_id=ANY($1::uuid[])', [[tenantId,otherTenantId,constraintTenantId]]);
    await database.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])', [[tenantId, otherTenantId, constraintTenantId]]);
    await database.query('DELETE FROM "user" WHERE id=$1', [userId]);
  } finally { await database.end(); }
});




async function create(page:Page,customer=customerId,requestId=randomUUID()) {
  const response=await page.request.post(api,{headers,data:{customerId:customer,requestId}});expect(response.status()).toBe(201);return (await response.json()).order.id as string;
}
async function read(page:Page,id:string) {const response=await page.request.get(`${api}/${id}`);expect(response.status()).toBe(200);return (await response.json()).order;}
async function save(page:Page,id:string,version:number,items:{productId:string;quantity:number}[],customer=customerId) {
  return page.request.put(`${api}/${id}`,{headers,data:{version,customerId:customer,items}});
}
const taxApi=`/api/tenants/${tenantId}/tax-settings`;

test("anonymous users cannot create, read or edit drafts and tax settings",async({request,page})=>{
  const id=randomUUID();expect((await request.get(api)).status()).toBe(401);
  expect((await request.get(`${api}/${id}`)).status()).toBe(401);
  expect((await request.post(api,{headers,data:{customerId,requestId:randomUUID()}})).status()).toBe(401);
  expect((await request.put(`${api}/${id}`,{headers,data:{version:1,customerId,items:[]}})).status()).toBe(401);
  expect((await request.get(taxApi)).status()).toBe(401);await page.goto(listURL);await expect(page).toHaveURL(/\/sign-in$/);
});

test("employees create and edit drafts in the responsive interface without changing stock",async({page})=>{
  await signIn(page);await page.setViewportSize({width:375,height:812});await page.goto(`${listURL}/new`);
  await page.getByRole("button",{name:"Create draft",exact:true}).click();await expect(page.locator("main").getByRole("alert")).toHaveText("Choose a customer.");
  await page.getByLabel("Customer",{exact:true}).selectOption(customerId);await page.getByRole("button",{name:"Create draft",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Draft order",exact:true})).toBeVisible();
  const id=page.url().split("/").pop()!;
  await page.getByLabel("Product to add",{exact:true}).selectOption(productId);await page.getByRole("button",{name:"Add product",exact:true}).click();
  await page.getByLabel("Quantity for Order laptop",{exact:true}).fill("2");
  await page.getByRole("button",{name:"Save draft",exact:true}).click();await expect(page.getByRole("status")).toHaveText("Draft saved.");
  await expect(page.getByText("Subtotal: $259.98 USD",{exact:true})).toBeVisible();await expect(page.getByText("Total: $285.98 USD",{exact:true})).toBeVisible();
  await page.getByLabel("Product to add",{exact:true}).selectOption(productId);await page.getByRole("button",{name:"Add product",exact:true}).click();
  await expect(page.getByLabel("Quantity for Order laptop",{exact:true})).toHaveValue("3");
  await page.getByRole("button",{name:"Save draft",exact:true}).click();await expect(page.getByRole("status")).toHaveText("Draft saved.");
  let order=await read(page,id);expect(order.items).toHaveLength(1);expect(order.items[0].quantity).toBe(3);
  await page.getByLabel("Customer",{exact:true}).selectOption(secondCustomerId);
  await page.getByRole("button",{name:"Remove Order laptop",exact:true}).click();
  await page.getByRole("button",{name:"Save draft",exact:true}).click();await expect(page.getByRole("status")).toHaveText("Draft saved.");
  order=await read(page,id);expect(order.customerId).toBe(secondCustomerId);expect(order.items).toHaveLength(0);expect(order.totals.totalCents).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await database.query("SELECT physical_quantity FROM inventory_balances WHERE tenant_id=$1 AND product_id=$2",[tenantId,productId])).rows[0].physical_quantity).toBe(8);
  expect((await database.query("SELECT count(*) FROM stock_movements WHERE tenant_id=$1",[tenantId])).rows[0].count).toBe("0");
});

test("draft creation is idempotent across concurrent retries and edited customers",async({page})=>{
  await signIn(page);const requestId=randomUUID();const data={customerId,requestId};
  const responses=await Promise.all([page.request.post(api,{headers,data}),page.request.post(api,{headers,data})]);expect(responses.map(r=>r.status()).sort()).toEqual([200,201]);
  const bodies=await Promise.all(responses.map(r=>r.json()));expect(bodies[0].order.id).toBe(bodies[1].order.id);const id=bodies[0].order.id;
  expect((await save(page,id,1,[],secondCustomerId)).status()).toBe(200);
  const replay=await page.request.post(api,{headers,data});expect(replay.status()).toBe(200);expect((await replay.json()).order.id).toBe(id);
  expect((await page.request.post(api,{headers,data:{...data,customerId:secondCustomerId}})).status()).toBe(409);
});

test("captured prices persist through quantity edits and require explicit reviewed refresh",async({page})=>{
  await signIn(page);const id=await create(page);
  expect((await save(page,id,1,[{productId,quantity:2}])).status()).toBe(200);
  await database.query("UPDATE products SET unit_price_cents=15000 WHERE id=$1",[productId]);
  try {
    let order=await read(page,id);expect(order.items[0].unitPriceCents).toBe(12999);expect(order.items[0].priceChanged).toBe(true);
    expect((await save(page,id,order.version,[{productId,quantity:3}])).status()).toBe(200);
    order=await read(page,id);expect(order.items[0].unitPriceCents).toBe(12999);
    const stale=await page.request.post(`${api}/${id}/refresh-prices`,{headers,data:{version:order.version,prices:[{productId,unitPriceCents:14000}]}});expect(stale.status()).toBe(409);
    await page.goto(`${listURL}/${id}`);await expect(page.getByText("Captured unit price: $129.99 USD",{exact:true})).toBeVisible();
    await expect(page.getByText(/Catalog price changed: \$150\.00 USD/)).toBeVisible();
    await page.getByRole("button",{name:"Accept current catalog prices",exact:true}).click();await expect(page.getByRole("status")).toHaveText("Catalog prices accepted.");
    order=await read(page,id);expect(order.items[0].unitPriceCents).toBe(15000);expect(order.items[0].priceChanged).toBe(false);expect(order.totals.totalCents).toBe(49500);
  } finally {await database.query("UPDATE products SET unit_price_cents=12999 WHERE id=$1",[productId]);}
});

test("concurrent draft edits reject stale versions instead of losing updates",async({page})=>{
  await signIn(page);const id=await create(page);
  const responses=await Promise.all([save(page,id,1,[{productId,quantity:2}]),save(page,id,1,[{productId,quantity:3}])]);expect(responses.map(r=>r.status()).sort()).toEqual([200,409]);
  const order=await read(page,id);expect(order.version).toBe(2);expect([2,3]).toContain(order.items[0].quantity);
  expect((await save(page,id,1,[])).status()).toBe(409);
});

test("invalid fields, tampered money and untrusted origins cannot alter drafts",async({page})=>{
  await signIn(page);const id=await create(page);const base={version:1,customerId,items:[{productId,quantity:1}]};
  for(const change of [{version:0},{version:"1"},{items:[{productId,quantity:0}]},{items:[{productId,quantity:1.5}]},{items:[{productId,quantity:1000001}]},
    {items:[{productId,quantity:1,unitPriceCents:1}]},{items:[{productId,quantity:1},{productId,quantity:2}]},{totalCents:1},{tenantId:otherTenantId},{status:"CONFIRMED"}]) {
    expect((await page.request.put(`${api}/${id}`,{headers,data:{...base,...change}})).status()).toBe(422);
  }
  expect((await page.request.put(`${api}/${id}`,{headers:{...headers,"Content-Type":"application/json"},data:Buffer.from("{")})).status()).toBe(400);
  expect((await page.request.put(`${api}/${id}`,{headers:{...headers,"Content-Type":"text/plain"},data:"bad"})).status()).toBe(415);
  expect((await page.request.put(`${api}/${id}`,{headers:{Origin:"https://evil.example"},data:base})).status()).toBe(403);
  expect((await page.request.post(api,{data:{customerId,requestId:randomUUID()}})).status()).toBe(403);
  expect((await page.request.get(`${api}/invalid`)).status()).toBe(400);
  expect((await page.request.delete(`${api}/${id}`,{headers})).status()).toBe(405);
  expect((await page.request.post(`${api}/${id}/confirm`,{headers,data:{version:1}})).status()).toBe(422);
  const order=await read(page,id);expect(order.version).toBe(1);expect(order.items).toHaveLength(0);
});

test("tenant isolation applies to customer references, product lines and revoked membership",async({page})=>{
  await signIn(page);const id=await create(page);
  expect((await page.request.get(`/api/tenants/${otherTenantId}/orders`)).status()).toBe(403);
  expect((await page.request.post(api,{headers,data:{customerId:foreignCustomerId,requestId:randomUUID()}})).status()).toBe(422);
  expect((await save(page,id,1,[{productId:otherProductId,quantity:1}])).status()).toBe(422);
  expect((await save(page,id,1,[],foreignCustomerId)).status()).toBe(422);
  const foreignOrder=randomUUID();await database.query("INSERT INTO orders (id,tenant_id,customer_id,created_by_membership_id,request_id,request_hash,updated_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)",
    [foreignOrder,otherTenantId,foreignCustomerId,foreignMembershipId,randomUUID(),"0".repeat(64)]);
  expect((await page.request.get(`/api/tenants/${otherTenantId}/orders/${foreignOrder}`)).status()).toBe(403);
  expect((await page.request.get(`${api}/${foreignOrder}`)).status()).toBe(404);
  expect((await save(page,foreignOrder,1,[])).status()).toBe(404);
  expect((await page.request.get(`${api}/${randomUUID()}`)).status()).toBe(404);
  await database.query("UPDATE memberships SET is_active=false WHERE id=$1",[membershipId]);
  try {
    expect((await page.request.get(`${api}/${id}`)).status()).toBe(403);expect((await save(page,id,1,[])).status()).toBe(403);
    await page.goto(`${listURL}/${id}`);await expect(page.getByRole("heading",{name:"Workspace unavailable"})).toBeVisible();
  }finally{await database.query("UPDATE memberships SET is_active=true WHERE id=$1",[membershipId]);}
});

test("tax settings are administrator-only, versioned and used by current draft previews",async({page})=>{
  await signIn(page);const id=await create(page);expect((await save(page,id,1,[{productId:cableId,quantity:1}])).status()).toBe(200);
  const initial=await (await page.request.get(taxApi)).json();expect(initial.taxRateBps).toBe(1000);expect((await read(page,id)).totals.taxCents).toBe(1);
  expect((await page.request.put(taxApi,{headers,data:{version:initial.version,taxRateBps:0}})).status()).toBe(403);
  await page.goto(`/tenants/${tenantId}/tax-settings`);await expect(page.getByRole("heading",{name:"Workspace unavailable"})).toBeVisible();
  await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1",[membershipId]);
  try {
    await page.goto(`/tenants/${tenantId}/tax-settings`);await page.getByLabel("Tax rate (%)",{exact:true}).fill("0");
    await page.getByRole("button",{name:"Save tax settings",exact:true}).click();await expect(page.getByRole("status")).toHaveText("Tax settings saved.");
    expect((await read(page,id)).totals.taxCents).toBe(0);
    expect((await page.request.put(taxApi,{headers,data:{version:initial.version,taxRateBps:1000}})).status()).toBe(409);
    const current=await (await page.request.get(taxApi)).json();expect((await page.request.put(taxApi,{headers,data:{version:current.version,taxRateBps:10001}})).status()).toBe(422);
  } finally {await database.query("UPDATE tenants SET tax_rate_bps=1000 WHERE id=$1",[tenantId]);await database.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1",[membershipId]);}
});

test("excessive subtotals and forced line-write failures roll back the complete draft",async({page})=>{
  await signIn(page);const id=await create(page);expect((await save(page,id,1,[{productId,quantity:1}])).status()).toBe(200);
  expect((await save(page,id,2,[{productId,quantity:1000000}])).status()).toBe(409);expect((await read(page,id)).version).toBe(2);
  await database.query(`CREATE FUNCTION fail_order_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.quantity=7 THEN RAISE EXCEPTION 'Forced draft test failure'; END IF; RETURN NEW; END $$`);
  try {await database.query("CREATE TRIGGER fail_order_line BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION fail_order_line()");
    try {expect((await save(page,id,2,[{productId:cableId,quantity:7}],secondCustomerId)).status()).toBe(500);
      const order=await read(page,id);expect(order.version).toBe(2);expect(order.customerId).toBe(customerId);expect(order.items[0].productId).toBe(productId);
    }finally{await database.query("DROP TRIGGER fail_order_line ON order_items");}
  }finally{await database.query("DROP FUNCTION fail_order_line()");}
});

test("SQL guards reject cross-tenant relationships and invalid draft data",async({page})=>{
  await signIn(page);const id=await create(page);
  const sql="INSERT INTO orders (tenant_id,customer_id,created_by_membership_id,request_id,request_hash,updated_at) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)";
  await expect(database.query(sql,[tenantId,foreignCustomerId,membershipId,randomUUID(),"0".repeat(64)])).rejects.toMatchObject({code:"23503"});
  await expect(database.query(sql,[otherTenantId,foreignCustomerId,membershipId,randomUUID(),"0".repeat(64)])).rejects.toMatchObject({code:"23503"});
  const lineSql="INSERT INTO order_items (tenant_id,order_id,product_id,quantity,unit_price_cents,product_name,product_sku) VALUES ($1,$2,$3,$4,$5,'Line','LINE-SKU')";
  await expect(database.query(lineSql,[tenantId,id,otherProductId,1,100])).rejects.toMatchObject({code:"23503"});
  await expect(database.query(lineSql,[tenantId,id,productId,0,100])).rejects.toMatchObject({code:"23514",constraint:"order_items_quantity_valid"});
  await expect(database.query(lineSql,[tenantId,id,productId,1,-1])).rejects.toMatchObject({code:"23514",constraint:"order_items_price_non_negative"});
  await expect(database.query("UPDATE tenants SET tax_rate_bps=10001 WHERE id=$1",[tenantId])).rejects.toMatchObject({code:"23514"});
  await expect(database.query("DELETE FROM customers WHERE id=$1",[customerId])).rejects.toMatchObject({code:"23001"});
});

test("lost creation responses can be retried without creating duplicate drafts",async({page})=>{
  await signIn(page);await page.goto(`${listURL}/new`);await page.getByLabel("Customer",{exact:true}).selectOption(customerId);
  const pattern=`**${api}`;let requestId:string|undefined;
  await page.route(pattern,async route=>{requestId=route.request().postDataJSON().requestId;const response=await route.fetch();expect(response.status()).toBe(201);await route.abort();});
  await page.getByRole("button",{name:"Create draft",exact:true}).click();await expect(page.locator("main").getByRole("alert")).toContainText("Keep the same customer and retry");
  await page.unroute(pattern);const replay=page.waitForResponse(r=>r.url().endsWith(api)&&r.request().method()==="POST");
  await page.getByRole("button",{name:"Create draft",exact:true}).click();const response=await replay;expect(response.status()).toBe(200);expect(response.request().postDataJSON().requestId).toBe(requestId);
  await expect(page.getByRole("heading",{name:"Draft order",exact:true})).toBeVisible();
  expect((await database.query("SELECT count(*) FROM orders WHERE tenant_id=$1 AND request_id=$2",[tenantId,requestId])).rows[0].count).toBe("1");
});

test("stale editor errors retain values until an explicit reload",async({page})=>{
  await signIn(page);const id=await create(page);expect((await save(page,id,1,[{productId,quantity:1}])).status()).toBe(200);
  await page.goto(`${listURL}/${id}`);await page.getByLabel("Quantity for Order laptop",{exact:true}).fill("2");
  expect((await save(page,id,2,[{productId,quantity:3}])).status()).toBe(200);
  await page.getByRole("button",{name:"Save draft",exact:true}).click();await expect(page.locator("main").getByRole("alert")).toHaveText("This draft has changed. Reload it before editing again.");
  await expect(page.getByLabel("Quantity for Order laptop",{exact:true})).toHaveValue("2");await page.getByRole("button",{name:"Reload draft",exact:true}).click();
  await expect(page.getByRole("status")).toHaveText("Draft reloaded.");await expect(page.getByLabel("Quantity for Order laptop",{exact:true})).toHaveValue("3");
});

test("orders and entity pickers expose pages beyond the first twenty records",async({page})=>{
  await signIn(page);
  for(let n=0;n<23;n++) {
    await database.query("INSERT INTO customers (tenant_id,company_name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)",[tenantId,`Paged client ${String(n).padStart(2,"0")}`]);
    await database.query("INSERT INTO products (tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,$3,100,CURRENT_TIMESTAMP)",[tenantId,`PAGED-${n}`,`Paged product ${String(n).padStart(2,"0")}`]);
    await create(page);
  }
  const first=await (await page.request.get(api)).json(),second=await (await page.request.get(`${api}?page=2`)).json();expect(first.orders).toHaveLength(20);expect(first.hasNextPage).toBe(true);
  const ordered=(await database.query("SELECT id FROM orders WHERE tenant_id=$1 ORDER BY updated_at DESC,id DESC",[tenantId])).rows.map(r=>r.id);
  expect([...first.orders,...second.orders].map((r:{id:string})=>r.id)).toEqual(ordered);
  for(const query of ["page=0","page=10000","page=1&page=2"])expect((await page.request.get(`${api}?${query}`)).status()).toBe(400);
  await page.goto(`${listURL}/new`);await page.getByRole("button",{name:"Next customers",exact:true}).click();await page.getByLabel("Customer",{exact:true}).selectOption({label:"Paged client 22"});
  await page.getByRole("button",{name:"Create draft",exact:true}).click();await expect(page.getByRole("heading",{name:"Draft order",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Next products",exact:true}).click();await page.getByLabel("Product to add",{exact:true}).selectOption({label:"Paged product 22 (PAGED-22)"});
  await page.getByRole("button",{name:"Add product",exact:true}).click();await page.getByRole("button",{name:"Save draft",exact:true}).click();await expect(page.getByRole("status")).toHaveText("Draft saved.");
});
