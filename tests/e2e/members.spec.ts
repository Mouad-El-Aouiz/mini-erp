import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";

const database = new Pool({ connectionString: process.env.DATABASE_URL });
const tenantId = randomUUID(), otherTenantId = randomUUID();
const users: string[] = [randomUUID(), randomUUID(), randomUUID()];
const memberships = [randomUUID(), randomUUID(), randomUUID()];
const emails = users.map(id => `members-${id}@example.test`);
const password = "Members-tests-only-password-2026!";
const headers = { Origin: "http://127.0.0.1:3100" };
const api = `/api/tenants/${tenantId}/members`;
const list = `/tenants/${tenantId}/members`;
const createdUsers: string[] = [];
async function signIn(page: Page, index = 0, email = emails[index]) {
  const submit = () => page.request.post("/api/auth/sign-in/email", { headers, data: { email, password } });
  let response = await submit();
  if (response.status() === 429) {
    const delay = Number(response.headers()["x-retry-after"] ?? response.headers()["retry-after"]);
    expect(Number.isFinite(delay) && delay >= 0 && delay <= 10).toBe(true);
    await new Promise(resolve => setTimeout(resolve, (delay + 1) * 1000)); response = await submit();
  }
  expect(response.status()).toBe(200);
}
const input = (email: string) => ({ name: "New employee", email, password, role: "EMPLOYEE" });
const update = (page: Page, id: string, data: object) => page.request.put(`${api}/${id}`, { headers, data });
test.beforeAll(async () => {
  const hash = await hashPassword(password);
  const tx = await database.connect();
  try {
    await tx.query("BEGIN");
    for (const id of [tenantId, otherTenantId]) await tx.query("INSERT INTO tenants (id,name,updated_at) VALUES ($1,'Member Test Company',CURRENT_TIMESTAMP)", [id]);
    for (let i = 0; i < users.length; i++) {
      await tx.query('INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)', [users[i], `Fixture member ${i}`, emails[i]]);
      await tx.query('INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,\'credential\',$2,$3,CURRENT_TIMESTAMP)', [randomUUID(), users[i], hash]);
      await tx.query("INSERT INTO memberships (id,tenant_id,user_id,role,updated_at) VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)", [memberships[i], tenantId, users[i], i === 2 ? "EMPLOYEE" : "ADMIN"]);
    }
    await tx.query("INSERT INTO memberships (tenant_id,user_id,role,updated_at) VALUES ($1,$2,'ADMIN',CURRENT_TIMESTAMP)", [otherTenantId, users[2]]);
    await tx.query("COMMIT");
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
});
test.beforeEach(async () => {
  await database.query("UPDATE memberships SET role='EMPLOYEE',is_active=false,version=1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1", [tenantId]);
  for(let i=0;i<3;i++) await database.query("UPDATE memberships SET role=$2,is_active=true,version=1,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[memberships[i],i===2?"EMPLOYEE":"ADMIN"]);
});
test.afterAll(async () => {
  try {
    const remaining = (await database.query("SELECT DISTINCT user_id FROM memberships WHERE tenant_id=$1", [tenantId])).rows.map(row => row.user_id as string);
    createdUsers.push(...remaining.filter(id => !users.includes(id)));
    await database.query("DELETE FROM orders WHERE tenant_id=$1", [tenantId]);
    await database.query("DELETE FROM customers WHERE tenant_id=$1", [tenantId]);
    await database.query("DELETE FROM memberships WHERE tenant_id=ANY($1::uuid[])", [[tenantId, otherTenantId]]);
    await database.query("DELETE FROM tenants WHERE id=ANY($1::uuid[])", [[tenantId, otherTenantId]]);
    await database.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [[...users, ...createdUsers]]);
  } finally { await database.end(); }
});
test("anonymous users and employees cannot administer members", async ({ page, request }) => {
  expect((await request.get(api)).status()).toBe(401);
  expect((await request.post(api, { headers, data: input("anonymous@example.test") })).status()).toBe(401);
  expect((await request.put(`${api}/${memberships[0]}`,{headers,data:{version:1,role:"EMPLOYEE",isActive:false}})).status()).toBe(401);
  await page.goto(list); await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page,2);
  expect((await page.request.get(api)).status()).toBe(403);
  expect((await page.request.post(api,{headers,data:input("employee-denied@example.test")})).status()).toBe(403);
  expect((await update(page,memberships[0],{version:1,role:"EMPLOYEE",isActive:false})).status()).toBe(403);
  await page.goto(`/tenants/${tenantId}`);
  await expect(page.getByRole("link",{name:"Manage members"})).toHaveCount(0);
  await page.goto(list); await expect(page.getByRole("heading",{name:"Members",exact:true})).toHaveCount(0);
});
test("administrator creates a member through the browser with hashed credentials and working login",async({page,browser})=>{
  await signIn(page);await page.goto(list);await page.getByRole("link",{name:"New member",exact:true}).click();
  await page.getByRole("button",{name:"Create member"}).click();await expect(page.locator("main").getByRole("alert")).toHaveText("Please correct the highlighted fields.");
  const email=`new-member-${randomUUID()}@example.test`;
  await page.setViewportSize({width:375,height:812});
  await page.getByLabel("Full name",{exact:true}).fill("New employee");await page.getByLabel("Email",{exact:true}).fill(email.toUpperCase());
  await page.getByLabel("Initial password",{exact:true}).fill(password);await page.getByRole("button",{name:"Create member"}).click();
  await expect(page.getByRole("status")).toHaveText("Member created.");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const row=(await database.query('SELECT u.id,a.password,m.role,m.is_active FROM "user" u JOIN account a ON a."userId"=u.id JOIN memberships m ON m.user_id=u.id WHERE u.email=$1',[email])).rows[0];
  createdUsers.push(row.id);expect(row.password).not.toBe(password);expect(row.role).toBe("EMPLOYEE");expect(row.is_active).toBe(true);
  const response=await page.request.get(api);const body=await response.json();expect(JSON.stringify(body)).not.toContain(row.password);expect(JSON.stringify(body)).not.toContain(password);
  const context=await browser.newContext();try{const employee=await context.newPage();await signIn(employee,0,email);expect((await employee.request.get(`/api/tenants/${tenantId}/customers`)).status()).toBe(200);expect((await employee.request.get(api)).status()).toBe(403);}finally{await context.close();}
});
test("existing global accounts are not reset or attached to a company",async({page})=>{
  await signIn(page);
  const before=(await database.query('SELECT password FROM account WHERE "userId"=$1',[users[2]])).rows[0].password;
  const response=await page.request.post(api,{headers,data:{...input(emails[2].toUpperCase()),password:"Different-test-password-2026!"}});
  expect(response.status()).toBe(409);expect((await database.query('SELECT password FROM account WHERE "userId"=$1',[users[2]])).rows[0].password).toBe(before);
  expect(Number((await database.query("SELECT count(*) FROM memberships WHERE tenant_id=$1 AND user_id=$2",[tenantId,users[2]])).rows[0].count)).toBe(1);
});
test("input, trusted origins, pagination, and tenant boundaries are enforced",async({page})=>{
  await signIn(page);
  expect((await page.request.get(api+"?page=0")).status()).toBe(400);
  expect((await page.request.get(api+"?page=1&page=2")).status()).toBe(400);
  expect((await page.request.get(`/api/tenants/${otherTenantId}/members`)).status()).toBe(403);
  const foreign=(await database.query("SELECT id FROM memberships WHERE tenant_id=$1",[otherTenantId])).rows[0].id;
  expect((await update(page,foreign,{version:1,role:"EMPLOYEE",isActive:false})).status()).toBe(404);
  expect((await update(page,"invalid",{version:1,role:"EMPLOYEE",isActive:false})).status()).toBe(400);
  expect((await page.request.post(api,{headers:{Origin:"https://foreign.invalid"},data:input("denied@example.test")})).status()).toBe(403);
  expect((await page.request.post(api,{headers,data:{...input("invalid@example.test"),tenantId:otherTenantId}})).status()).toBe(422);
  expect((await page.request.post(api,{headers:{...headers,"Content-Type":"text/plain"},data:"invalid"})).status()).toBe(415);
  expect((await page.request.post(api,{headers:{...headers,"Content-Type":"application/json"},data:Buffer.from("{")})).status()).toBe(400);
  const body=await(await page.request.get(api+"?page=9999")).json();expect(body.members).toEqual([]);expect(body.hasNextPage).toBe(false);
});
test("browser changes roles, deactivates access, and restores the same membership",async({page,browser})=>{
  await signIn(page);await page.goto(list);const form=page.getByRole("form",{name:`Manage ${emails[2]}`});
  await form.getByLabel("Role",{exact:true}).selectOption("ADMIN");await form.getByRole("button",{name:"Save member",exact:true}).click();
  await expect(form.getByLabel("Role",{exact:true})).toHaveValue("ADMIN");
  await expect.poll(async()=>Number((await database.query("SELECT version FROM memberships WHERE id=$1",[memberships[2]])).rows[0].version)).toBe(2);
  const context=await browser.newContext();try{
    const employee=await context.newPage();await signIn(employee,2);expect((await employee.request.get(api)).status()).toBe(200);
    await form.getByLabel("Active company access").uncheck();await form.getByRole("button",{name:"Save member",exact:true}).click();
    await expect.poll(async()=>Boolean((await database.query("SELECT is_active FROM memberships WHERE id=$1",[memberships[2]])).rows[0].is_active)).toBe(false);
    expect((await employee.request.get(`/api/tenants/${tenantId}/customers`)).status()).toBe(403);
    expect((await employee.request.get(`/api/tenants/${otherTenantId}/customers`)).status()).toBe(200);
    await form.getByLabel("Active company access").check();await form.getByRole("button",{name:"Save member",exact:true}).click();
    await expect.poll(async()=>Boolean((await database.query("SELECT is_active FROM memberships WHERE id=$1",[memberships[2]])).rows[0].is_active)).toBe(true);
    expect((await employee.request.get(`/api/tenants/${tenantId}/customers`)).status()).toBe(200);
  }finally{await context.close();}
});
test("last administrator cannot be demoted or deactivated",async({page})=>{
  await signIn(page);
  expect((await update(page,memberships[1],{version:1,role:"EMPLOYEE",isActive:false})).status()).toBe(200);
  for(const data of [{version:1,role:"EMPLOYEE",isActive:true},{version:1,role:"ADMIN",isActive:false}]) {
    const response=await update(page,memberships[0],data);expect(response.status()).toBe(409);expect((await response.json()).error).toContain("at least one active administrator");
  }
  const row=(await database.query("SELECT role,is_active,version FROM memberships WHERE id=$1",[memberships[0]])).rows[0];expect(row).toEqual({role:"ADMIN",is_active:true,version:1});
});
test("stale and simultaneous changes cannot overwrite member access",async({page})=>{
  await signIn(page);
  const responses=await Promise.all([update(page,memberships[2],{version:1,role:"ADMIN",isActive:true}),update(page,memberships[2],{version:1,role:"EMPLOYEE",isActive:false})]);
  expect(responses.map(r=>r.status()).sort()).toEqual([200,409]);
  expect((await update(page,memberships[2],{version:1,role:"EMPLOYEE",isActive:true})).status()).toBe(409);
});
test("concurrent administrator self-demotions preserve an active administrator",async({page,browser})=>{
  await signIn(page);const context=await browser.newContext();try{
    const second=await context.newPage();await signIn(second,1);
    const responses=await Promise.all([update(page,memberships[0],{version:1,role:"EMPLOYEE",isActive:true}),update(second,memberships[1],{version:1,role:"EMPLOYEE",isActive:true})]);
    expect(responses.map(r=>r.status()).sort()).toEqual([200,409]);
    expect(Number((await database.query("SELECT count(*) FROM memberships WHERE tenant_id=$1 AND role='ADMIN' AND is_active=true",[tenantId])).rows[0].count)).toBe(1);
  }finally{await context.close();}
});
test("a revoked administrator is rechecked inside an in-flight mutation",async({page})=>{
  await signIn(page);
  const lock=await database.connect();
  try{
    await lock.query("BEGIN");await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 42001))",[tenantId]);
    const pending=update(page,memberships[2],{version:1,role:"ADMIN",isActive:true});
    await expect.poll(async()=>Number((await database.query("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%'")).rows[0].count)).toBeGreaterThan(0);
    await database.query("UPDATE memberships SET role='EMPLOYEE',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[memberships[0]]);
    await lock.query("COMMIT");
    expect((await pending).status()).toBe(403);
    expect((await database.query("SELECT role,version FROM memberships WHERE id=$1",[memberships[2]])).rows[0]).toEqual({role:"EMPLOYEE",version:1});
  }finally{await lock.query("ROLLBACK");lock.release();}
});

test("failed provisioning rolls back the new user and credentials", async ({ page }) => {
  await signIn(page);
  const email = `rollback-${randomUUID()}@example.test`;
  const suffix = tenantId.replaceAll("-", "");
  const functionName = `member_failure_${suffix}`, triggerName = `member_failure_trigger_${suffix}`;
  await database.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id = '${tenantId}'::uuid THEN RAISE EXCEPTION 'Simulated member provisioning failure'; END IF; RETURN NEW; END; $$`);
  try {
    await database.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON memberships FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
    expect((await page.request.post(api, { headers, data: input(email) })).status()).toBe(500);
    expect(Number((await database.query('SELECT count(*) FROM "user" WHERE email=$1', [email])).rows[0].count)).toBe(0);
  } finally {
    await database.query(`DROP TRIGGER IF EXISTS ${triggerName} ON memberships`);
    await database.query(`DROP FUNCTION ${functionName}()`);
  }
});
test("deactivation preserves historical order actors", async ({page,browser}) => {
  await signIn(page);
  const customer = (await (await page.request.post(`/api/tenants/${tenantId}/customers`, {headers,data:{companyName:"Historical member buyer"}})).json()).customer.id;
  const context = await browser.newContext();
  try {
    const employee = await context.newPage(); await signIn(employee,2);
    const response=await employee.request.post(`/api/tenants/${tenantId}/orders`,{headers,data:{requestId:randomUUID(),customerId:customer}});
    expect(response.status()).toBe(201); const orderId=(await response.json()).order.id;
    expect((await update(page,memberships[2],{version:1,role:"EMPLOYEE",isActive:false})).status()).toBe(200);
    expect((await database.query("SELECT created_by_membership_id FROM orders WHERE id=$1",[orderId])).rows[0].created_by_membership_id).toBe(memberships[2]);
    expect((await page.request.get(`/api/tenants/${tenantId}/orders/${orderId}`)).status()).toBe(200);
    expect((await employee.request.get(`/api/tenants/${tenantId}/orders/${orderId}`)).status()).toBe(403);
  } finally { await context.close(); }
});
test("member pagination has stable ordering and a bounded page size",async({page})=>{
  await signIn(page);
  for(let i=0;i<21;i++) {
    const id=randomUUID();createdUsers.push(id);
    await database.query('INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',[id,`Pagination member ${String(i).padStart(2,"0")}`,`pagination-${id}@example.test`]);
    await database.query("INSERT INTO memberships (tenant_id,user_id,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)",[tenantId,id]);
  }
  const first=await(await page.request.get(api)).json();
  const second=await(await page.request.get(api+"?page=2")).json();
  expect(first.members).toHaveLength(20);expect(first.pageSize).toBe(20);expect(first.hasNextPage).toBe(true);
  expect(second.members.length).toBeGreaterThan(0);expect(second.hasNextPage).toBe(false);
  expect(first.members.some((m:{id:string})=>second.members.some((n:{id:string})=>m.id===n.id))).toBe(false);
});
