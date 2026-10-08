import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";

const database=new Pool({connectionString:process.env.DATABASE_URL});
const tenantId=randomUUID(),otherTenantId=randomUUID(),userId=randomUUID(),secondUserId=randomUUID();
const membershipId=randomUUID(),foreignMembershipId=randomUUID(),secondMembershipId=randomUUID();
const customerId=randomUUID(),foreignCustomerId=randomUUID();
const email=`confirmation-${userId}@example.test`,secondEmail=`confirmation-${secondUserId}@example.test`;
const password="Confirmation-tests-only-password-2026!";
const headers={Origin:"http://127.0.0.1:3100"};
const api=`/api/tenants/${tenantId}/orders`;
const inventoryApi=`/api/tenants/${tenantId}/inventory`;

async function signIn(page:Page,loginEmail=email) {
  const submit=()=>page.request.post("/api/auth/sign-in/email",{headers,data:{email:loginEmail,password}});
  let response=await submit();
  if(response.status()===429) {
    const delay=Number(response.headers()["x-retry-after"]??response.headers()["retry-after"]);
    expect(Number.isFinite(delay)&&delay>=0&&delay<=10).toBe(true);
    await new Promise(resolve=>setTimeout(resolve,(delay+1)*1000));response=await submit();
  }
  expect(response.status()).toBe(200);
}
async function product(physical=10,price=3900,name="Confirmation laptop",id=randomUUID()) {
  await database.query("INSERT INTO products (id,tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)",[id,tenantId,`CONFIRM-${id.toUpperCase()}`,name,price]);
  await database.query("INSERT INTO inventory_balances (tenant_id,product_id,physical_quantity,updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)",[tenantId,id,physical]);
  return id;
}
async function draft(page:Page,items:{productId:string;quantity:number}[]=[]){
  const created=await page.request.post(api,{headers,data:{requestId:randomUUID(),customerId}});expect(created.status()).toBe(201);
  const id=(await created.json()).order.id as string;
  if(items.length)expect((await page.request.put(`${api}/${id}`,{headers,data:{version:1,customerId,items}})).status()).toBe(200);
  return id;
}
async function read(page:Page,id:string) {const response=await page.request.get(`${api}/${id}`);expect(response.status()).toBe(200);return (await response.json()).order;}
async function reviewed(page:Page,id:string){const order=await read(page,id);return {version:order.version,taxVersion:order.taxVersion};}
const confirm=(page:Page,id:string,data:{version:number;taxVersion:number})=>page.request.post(`${api}/${id}/confirm`,{headers,data});
async function quantities(id:string) {
  const row=(await database.query("SELECT physical_quantity,reserved_quantity FROM inventory_balances WHERE tenant_id=$1 AND product_id=$2",[tenantId,id])).rows[0];
  const reservations=(await database.query("SELECT coalesce(sum(quantity),0) AS quantity FROM stock_reservations WHERE tenant_id=$1 AND product_id=$2 AND status='ACTIVE'",[tenantId,id])).rows[0];
  expect(row.reserved_quantity).toBe(Number(reservations.quantity));return row as {physical_quantity:number;reserved_quantity:number};
}
const reservationCount=async(id:string)=>Number((await database.query("SELECT count(*) FROM stock_reservations WHERE tenant_id=$1 AND order_id=$2",[tenantId,id])).rows[0].count);

test.beforeAll(async()=>{
  const tx=await database.connect();
  try {
    await tx.query("BEGIN");
    for(const [id,address] of [[userId,email],[secondUserId,secondEmail]]){
      await tx.query('INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',[id,"Confirmation Test User",address]);
      await tx.query('INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',[randomUUID(),id,"credential",id,await hashPassword(password)]);
    }
    for(const id of [tenantId,otherTenantId]) await tx.query("INSERT INTO tenants (id,name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)",[id,"Confirmation Test Company"]);
    for(const [id,tenant,user,active] of [[membershipId,tenantId,userId,true],[secondMembershipId,tenantId,secondUserId,true],[foreignMembershipId,otherTenantId,userId,false]]){
      await tx.query("INSERT INTO memberships (id,tenant_id,user_id,role,is_active,updated_at) VALUES ($1,$2,$3,'EMPLOYEE',$4,CURRENT_TIMESTAMP)",[id,tenant,user,active]);
    }
    for(const [id,tenant] of [[customerId,tenantId],[foreignCustomerId,otherTenantId]])await tx.query("INSERT INTO customers (id,tenant_id,company_name,updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)",[id,tenant,"Confirmation Client"]);
    await tx.query("COMMIT");
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
});
test.afterAll(async()=>{
  try{
    for(const table of ["stock_reservations","order_items","orders","customers","stock_movements","products","memberships","tenants"]){
      const key=table==="tenants"?"id":"tenant_id";
      await database.query(`DELETE FROM ${table} WHERE ${key}=ANY($1::uuid[])`,[[tenantId,otherTenantId]]);
    }
    await database.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[[userId,secondUserId]]);
  }finally{await database.end();}
});

test("anonymous requests cannot confirm an order",async({request})=>{
  expect((await request.post(`${api}/${randomUUID()}/confirm`,{headers,data:{version:1,taxVersion:1}})).status()).toBe(401);
});

test("employees confirm through the mobile interface and accepted details survive catalog and tax changes",async({page})=>{
  await signIn(page);const productId=await product();const id=await draft(page,[{productId,quantity:3}]);
  await page.setViewportSize({width:375,height:812});await page.goto(`/tenants/${tenantId}/orders/${id}`);
  await page.getByLabel("Quantity for Confirmation laptop",{exact:true}).fill("4");
  await expect(page.getByRole("button",{name:"Confirm order",exact:true})).toBeDisabled();
  await page.getByLabel("Quantity for Confirmation laptop",{exact:true}).fill("3");
  await page.getByRole("button",{name:"Confirm order",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Confirmed order",exact:true})).toBeVisible();
  await expect(page.getByText("Total: $128.70 USD",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Save draft"})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await quantities(productId)).toEqual({physical_quantity:10,reserved_quantity:3});
  expect(await reservationCount(id)).toBe(1);
  expect((await database.query("SELECT count(*) FROM stock_movements WHERE tenant_id=$1 AND product_id=$2",[tenantId,productId])).rows[0].count).toBe("0");
  const before=await read(page,id);
  await database.query("UPDATE products SET name='Changed name',unit_price_cents=9900 WHERE id=$1",[productId]);
  await database.query("UPDATE customers SET company_name='Changed client' WHERE id=$1",[customerId]);
  await database.query("UPDATE tenants SET tax_rate_bps=2000,tax_version=tax_version+1 WHERE id=$1",[tenantId]);
  try{
    const after=await read(page,id);expect(after.totals).toEqual(before.totals);expect(after.customer.companyName).toBe("Confirmation Client");
    expect(after.items[0].productName).toBe("Confirmation laptop");expect(after.items[0].unitPriceCents).toBe(3900);
    expect(after.confirmedAt).toBe(before.confirmedAt);expect(after.confirmedByMembershipId).toBe(membershipId);
    expect((await page.request.put(`${api}/${id}`,{headers,data:{version:after.version,customerId,items:[]}})).status()).toBe(409);
    expect((await page.request.post(`${api}/${id}/refresh-prices`,{headers,data:{version:after.version,prices:[{productId,unitPriceCents:9900}]}})).status()).toBe(409);
    const stock=await(await page.request.get(inventoryApi)).json();const row=stock.inventory.find((r:{id:string})=>r.id===productId);
    expect(row).toMatchObject({physicalQuantity:10,reservedQuantity:3,availableQuantity:7});
    await page.goto(`/tenants/${tenantId}/inventory/${productId}`);await expect(page.getByText("Available quantity: 7",{exact:true})).toBeVisible();
  }finally{
    await database.query("UPDATE customers SET company_name='Confirmation Client' WHERE id=$1",[customerId]);
    await database.query("UPDATE tenants SET tax_rate_bps=1000,tax_version=tax_version+1 WHERE id=$1",[tenantId]);
  }
});

test("empty orders and insufficient products leave every reservation unchanged",async({page})=>{
  await signIn(page);const empty=await draft(page);expect((await confirm(page,empty,await reviewed(page,empty))).status()).toBe(409);
  const ids=[randomUUID(),randomUUID()].sort();const enough=await product(10,100,"Enough stock",ids[0]),missing=await product(0,100,"Missing stock",ids[1]);
  const id=await draft(page,[{productId:enough,quantity:2},{productId:missing,quantity:1}]);
  expect((await confirm(page,id,await reviewed(page,id))).status()).toBe(409);
  expect((await read(page,id)).status).toBe("DRAFT");expect((await read(page,id)).version).toBe(2);
  expect(await quantities(enough)).toEqual({physical_quantity:10,reserved_quantity:0});expect(await quantities(missing)).toEqual({physical_quantity:0,reserved_quantity:0});
  expect(await reservationCount(id)).toBe(0);
});

test("confirmation rechecks catalog prices and requires explicit acceptance",async({page})=>{
  await signIn(page);const productId=await product();const id=await draft(page,[{productId,quantity:1}]);
  await database.query("UPDATE products SET unit_price_cents=5000 WHERE id=$1",[productId]);
  expect((await confirm(page,id,await reviewed(page,id))).status()).toBe(409);expect(await reservationCount(id)).toBe(0);
  expect((await page.request.post(`${api}/${id}/refresh-prices`,{headers,data:{version:2,prices:[{productId,unitPriceCents:5000}]}})).status()).toBe(200);
  expect((await confirm(page,id,await reviewed(page,id))).status()).toBe(200);expect((await read(page,id)).totals.totalCents).toBe(5500);
});

test("a tax change blocks the old preview until the user reloads and reviews it",async({page})=>{
  await signIn(page);const productId=await product();const id=await draft(page,[{productId,quantity:1}]);
  await page.goto(`/tenants/${tenantId}/orders/${id}`);
  await database.query("UPDATE tenants SET tax_rate_bps=2500,tax_version=tax_version+1 WHERE id=$1",[tenantId]);
  try{
    await page.getByRole("button",{name:"Confirm order",exact:true}).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Tax settings have changed");expect(await reservationCount(id)).toBe(0);
    await page.getByRole("button",{name:"Reload draft",exact:true}).click();
    await expect(page.getByText("Total: $48.75 USD",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Confirm order",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Confirmed order",exact:true})).toBeVisible();
    expect((await read(page,id)).totals.taxRateBps).toBe(2500);
  }finally{await database.query("UPDATE tenants SET tax_rate_bps=1000,tax_version=tax_version+1 WHERE id=$1",[tenantId]);}
});

test("concurrent retries confirm once and a changed request or another actor cannot replay it",async({page,browser})=>{
  await signIn(page);const productId=await product();const id=await draft(page,[{productId,quantity:2}]);const data=await reviewed(page,id);
  const responses=await Promise.all([confirm(page,id,data),confirm(page,id,data)]);expect(responses.map(r=>r.status())).toEqual([200,200]);
  const bodies=await Promise.all(responses.map(r=>r.json()));expect(bodies.map(b=>b.order.replayed).sort()).toEqual([false,true]);
  expect(await reservationCount(id)).toBe(1);expect((await quantities(productId)).reserved_quantity).toBe(2);
  expect((await confirm(page,id.toUpperCase(),data)).status()).toBe(200);
  expect((await confirm(page,id,{...data,version:data.version+1})).status()).toBe(409);
  expect((await confirm(page,id,{...data,taxVersion:data.taxVersion+1})).status()).toBe(409);
  const context=await browser.newContext({baseURL:headers.Origin});
  try{const other=await context.newPage();await signIn(other,secondEmail);expect((await confirm(other,id,data)).status()).toBe(409);}finally{await context.close();}
});

test("competing orders cannot reserve the same available units",async({page})=>{
  await signIn(page);const productId=await product(5);const a=await draft(page,[{productId,quantity:4}]),b=await draft(page,[{productId,quantity:4}]);
  const da=await reviewed(page,a),db=await reviewed(page,b);const responses=await Promise.all([confirm(page,a,da),confirm(page,b,db)]);
  expect(responses.map(r=>r.status()).sort()).toEqual([200,409]);expect(await quantities(productId)).toEqual({physical_quantity:5,reserved_quantity:4});
  expect((await read(page,a)).status==="CONFIRMED").not.toBe((await read(page,b)).status==="CONFIRMED");
});

test("multi-product confirmations use a stable lock order without losing reservations",async({page})=>{
  await signIn(page);const p=await product(6),q=await product(6);const a=await draft(page,[{productId:p,quantity:3},{productId:q,quantity:3}]);
  const b=await draft(page,[{productId:q,quantity:2},{productId:p,quantity:2}]);
  const da=await reviewed(page,a),db=await reviewed(page,b);
  expect((await Promise.all([confirm(page,a,da),confirm(page,b,db)])).map(r=>r.status())).toEqual([200,200]);
  expect((await quantities(p)).reserved_quantity).toBe(5);expect((await quantities(q)).reserved_quantity).toBe(5);
});

test("a concurrent manual withdrawal and confirmation cannot consume the same stock",async({page})=>{
  await signIn(page);const productId=await product(10);const id=await draft(page,[{productId,quantity:8}]);const data=await reviewed(page,id);
  await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1",[membershipId]);
  try{
    const [confirmation,withdrawal]=await Promise.all([confirm(page,id,data),page.request.post(`${inventoryApi}/${productId}/movements`,{headers,data:{requestId:randomUUID(),quantityDelta:-3,reason:"Concurrent correction"}})]);
    expect([confirmation.status(),withdrawal.status()].sort()).toEqual(confirmation.status()===200?[200,409]:[201,409]);
    const stock=await quantities(productId);expect(stock.reserved_quantity<=stock.physical_quantity).toBe(true);
    expect(stock).toEqual(confirmation.status()===200?{physical_quantity:10,reserved_quantity:8}:{physical_quantity:7,reserved_quantity:0});
  }finally{await database.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1",[membershipId]);}
});

test("manual corrections preserve reservations and allow reducing physical stock to the reserved amount",async({page})=>{
  await signIn(page);const productId=await product(10);const id=await draft(page,[{productId,quantity:6}]);expect((await confirm(page,id,await reviewed(page,id))).status()).toBe(200);
  await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1",[membershipId]);
  try{
    const adjust=(quantityDelta:number)=>page.request.post(`${inventoryApi}/${productId}/movements`,{headers,data:{requestId:randomUUID(),quantityDelta,reason:"Reserved correction"}});
    expect((await adjust(-5)).status()).toBe(409);expect((await adjust(-4)).status()).toBe(201);
    expect(await quantities(productId)).toEqual({physical_quantity:6,reserved_quantity:6});
    expect((await database.query("SELECT count(*) FROM stock_movements WHERE tenant_id=$1 AND product_id=$2",[tenantId,productId])).rows[0].count).toBe("1");
  }finally{await database.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1",[membershipId]);}
});

test("reservation and final order write failures roll back every line and snapshot",async({page})=>{
  await signIn(page);const ids=[randomUUID(),randomUUID()].sort();const p=await product(10,100,"Rollback first",ids[0]),q=await product(10,100,"Rollback second",ids[1]);
  const id=await draft(page,[{productId:p,quantity:2},{productId:q,quantity:2}]);const data=await reviewed(page,id);
  for(const target of ["reservation","order"]){
    const table=target==="reservation"?"stock_reservations":"orders";
    const operation=target==="reservation"?"INSERT":"UPDATE";
    const condition=target==="reservation"?`NEW.product_id='${q}'::uuid`:`NEW.id='${id}'::uuid AND NEW.status::text='CONFIRMED'`;
    await database.query(`CREATE FUNCTION fail_confirmation_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'Forced confirmation test failure'; END IF; RETURN NEW; END $$`);
    try{
      await database.query(`CREATE TRIGGER fail_confirmation_test BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_confirmation_test()`);
      try{
        expect((await confirm(page,id,data)).status()).toBe(500);
        expect(await reservationCount(id)).toBe(0);expect((await quantities(p)).reserved_quantity).toBe(0);expect((await quantities(q)).reserved_quantity).toBe(0);
        const order=await read(page,id);expect(order.status).toBe("DRAFT");expect(order.version).toBe(data.version);expect(order.confirmedAt).toBeNull();expect(order.totalCents).toBeNull();
      }finally{await database.query(`DROP TRIGGER fail_confirmation_test ON ${table}`);}
    }finally{await database.query("DROP FUNCTION fail_confirmation_test()");}
  }
});

test("strict input, origin and HTTP method validation prevent confirmation side effects",async({page})=>{
  await signIn(page);const productId=await product();const id=await draft(page,[{productId,quantity:1}]);const data=await reviewed(page,id);const url=`${api}/${id}/confirm`;
  for(const body of [{version:data.version},{...data,version:0},{...data,taxVersion:"1"},{...data,totalCents:1},{...data,tenantId:otherTenantId},{...data,confirmedByMembershipId:membershipId},{...data,items:[]}]){
    expect((await page.request.post(url,{headers,data:body})).status()).toBe(422);
  }
  expect((await page.request.post(url,{headers:{...headers,"Content-Type":"application/json"},data:Buffer.from("{")})).status()).toBe(400);
  expect((await page.request.post(url,{headers:{...headers,"Content-Type":"text/plain"},data:"bad"})).status()).toBe(415);
  expect((await page.request.post(url,{data})).status()).toBe(403);
  expect((await page.request.post(url,{headers:{Origin:"https://evil.example"},data})).status()).toBe(403);
  expect((await page.request.get(url)).status()).toBe(405);expect((await page.request.delete(url,{headers})).status()).toBe(405);
  expect((await confirm(page,"invalid",data)).status()).toBe(400);
  await database.query("UPDATE orders SET version=version+1 WHERE id=$1",[id]);
  expect((await confirm(page,id,data)).status()).toBe(409);
  expect(await reservationCount(id)).toBe(0);
});

test("cross-tenant orders and revoked memberships cannot confirm or replay",async({page})=>{
  await signIn(page);const foreignOrder=randomUUID();
  await database.query("INSERT INTO orders (id,tenant_id,customer_id,created_by_membership_id,request_id,request_hash,updated_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)",[foreignOrder,otherTenantId,foreignCustomerId,foreignMembershipId,randomUUID(),"a".repeat(64)]);
  expect((await confirm(page,foreignOrder,{version:1,taxVersion:1})).status()).toBe(404);
  expect((await page.request.post(`/api/tenants/${otherTenantId}/orders/${foreignOrder}/confirm`,{headers,data:{version:1,taxVersion:1}})).status()).toBe(403);
  const productId=await product();const id=await draft(page,[{productId,quantity:1}]);const data=await reviewed(page,id);
  expect((await confirm(page,id,data)).status()).toBe(200);
  await database.query("UPDATE memberships SET is_active=false WHERE id=$1",[membershipId]);
  try{expect((await confirm(page,id,data)).status()).toBe(403);expect((await quantities(productId)).reserved_quantity).toBe(1);}
  finally{await database.query("UPDATE memberships SET is_active=true WHERE id=$1",[membershipId]);}
});

test("a lost confirmation response recovers to the saved order without reserving twice",async({page})=>{
  await signIn(page);const productId=await product();const id=await draft(page,[{productId,quantity:3}]);const data=await reviewed(page,id);
  await page.goto(`/tenants/${tenantId}/orders/${id}`);const pattern=`**${api}/${id}/confirm`;
  await page.route(pattern,async route=>{expect((await route.fetch()).status()).toBe(200);await route.abort();});
  await page.getByRole("button",{name:"Confirm order",exact:true}).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Reload the draft before retrying");
  await page.unroute(pattern);expect((await confirm(page,id,data)).status()).toBe(200);
  await page.getByRole("button",{name:"Reload draft",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Confirmed order",exact:true})).toBeVisible();
  expect(await reservationCount(id)).toBe(1);expect((await quantities(productId)).reserved_quantity).toBe(3);
});

test("large accepted totals serialize safely and zero-price orders can be confirmed",async({page})=>{
  await signIn(page);const free=await product(1,0);const zero=await draft(page,[{productId:free,quantity:1}]);
  expect((await confirm(page,zero,await reviewed(page,zero))).status()).toBe(200);expect((await read(page,zero)).totals.totalCents).toBe(0);
  const expensive=await product(1,2147483647);const id=await draft(page,[{productId:expensive,quantity:1}]);
  await database.query("UPDATE tenants SET tax_rate_bps=10000,tax_version=tax_version+1 WHERE id=$1",[tenantId]);
  try{
    expect((await confirm(page,id,await reviewed(page,id))).status()).toBe(200);
    const order=await read(page,id);expect(order.totals.totalCents).toBe(4294967294);expect(order.totalCents).toBe(4294967294);
    expect((await database.query("SELECT total_cents FROM orders WHERE id=$1",[id])).rows[0].total_cents).toBe("4294967294");
  }finally{await database.query("UPDATE tenants SET tax_rate_bps=1000,tax_version=tax_version+1 WHERE id=$1",[tenantId]);}
});

test("SQL guards enforce reservation references, quantities and complete consistent snapshots",async({page})=>{
  await signIn(page);const productId=await product();const id=await draft(page,[{productId,quantity:2}]);
  for(const quantity of [-1,11]) await expect(database.query("UPDATE inventory_balances SET reserved_quantity=$3 WHERE tenant_id=$1 AND product_id=$2",[tenantId,productId,quantity])).rejects.toMatchObject({code:"23514",constraint:"inventory_reserved_valid"});
  for(const sql of ["UPDATE orders SET status='CONFIRMED' WHERE id=$1","UPDATE orders SET subtotal_cents=1 WHERE id=$1"]){await expect(database.query(sql,[id])).rejects.toMatchObject({code:"23514",constraint:"orders_confirmation_snapshot_valid"});}
  const insert="INSERT INTO stock_reservations (tenant_id,order_id,product_id,quantity) VALUES ($1,$2,$3,$4)";
  await expect(database.query(insert,[tenantId,id,productId,0])).rejects.toMatchObject({code:"23514"});
  const unused=await product();await expect(database.query(insert,[tenantId,id,unused,1])).rejects.toMatchObject({code:"23503"});
  expect((await confirm(page,id,await reviewed(page,id))).status()).toBe(200);
  await expect(database.query(insert,[tenantId,id,productId,2])).rejects.toMatchObject({code:"23505"});
  for(const sql of ["UPDATE orders SET total_cents=0 WHERE id=$1","UPDATE orders SET tax_cents=NULL WHERE id=$1","UPDATE orders SET accepted_tax_rate_bps=10001 WHERE id=$1"]){await expect(database.query(sql,[id])).rejects.toMatchObject({code:"23514",constraint:"orders_confirmation_snapshot_valid"});}
  await expect(database.query("UPDATE orders SET confirmed_by_membership_id=$2 WHERE id=$1",[id,foreignMembershipId])).rejects.toMatchObject({code:"23503"});
  await expect(database.query("DELETE FROM order_items WHERE order_id=$1",[id])).rejects.toMatchObject({code:"23001"});
});
