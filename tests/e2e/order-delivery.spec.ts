import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";

const database=new Pool({connectionString:process.env.DATABASE_URL});
const tenantId=randomUUID(),otherTenantId=randomUUID(),userId=randomUUID(),secondUserId=randomUUID();
const membershipId=randomUUID(),foreignMembershipId=randomUUID(),secondMembershipId=randomUUID();
const customerId=randomUUID(),foreignCustomerId=randomUUID();
const email=`delivery-${userId}@example.test`,secondEmail=`delivery-${secondUserId}@example.test`;
const password="Delivery-tests-only-password-2026!";
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
async function product(physical=10,price=3900,name="Delivery laptop",id=randomUUID()) {
  await database.query("INSERT INTO products (id,tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)",[id,tenantId,`DELIVERY-${id.toUpperCase()}`,name,price]);
  await database.query("INSERT INTO inventory_balances (tenant_id,product_id,physical_quantity,updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)",[tenantId,id,physical]);
  if(physical>0)await database.query("INSERT INTO stock_movements (tenant_id,product_id,request_id,quantity_delta,reason,recorded_by_membership_id) VALUES ($1,$2,$3,$4,'Test opening stock',$5)",[tenantId,id,randomUUID(),physical,membershipId]);
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
  expect(row.reserved_quantity).toBe(Number(reservations.quantity));
  const history=(await database.query("SELECT coalesce(sum(quantity_delta),0) AS physical FROM stock_movements WHERE tenant_id=$1 AND product_id=$2",[tenantId,id])).rows[0];
  expect(row.physical_quantity).toBe(Number(history.physical));return row as {physical_quantity:number;reserved_quantity:number};
}

test.beforeAll(async()=>{
  const tx=await database.connect();
  try {
    await tx.query("BEGIN");
    for(const [id,address] of [[userId,email],[secondUserId,secondEmail]]){
      await tx.query('INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',[id,"Delivery Test User",address]);
      await tx.query('INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',[randomUUID(),id,"credential",id,await hashPassword(password)]);
    }
    for(const id of [tenantId,otherTenantId]) await tx.query("INSERT INTO tenants (id,name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)",[id,"Delivery Test Company"]);
    for(const [id,tenant,user,active] of [[membershipId,tenantId,userId,true],[secondMembershipId,tenantId,secondUserId,true],[foreignMembershipId,otherTenantId,userId,false]]){
      await tx.query("INSERT INTO memberships (id,tenant_id,user_id,role,is_active,updated_at) VALUES ($1,$2,$3,'EMPLOYEE',$4,CURRENT_TIMESTAMP)",[id,tenant,user,active]);
    }
    for(const [id,tenant] of [[customerId,tenantId],[foreignCustomerId,otherTenantId]])await tx.query("INSERT INTO customers (id,tenant_id,company_name,updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)",[id,tenant,"Delivery Client"]);
    await tx.query("COMMIT");
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
});
test.afterAll(async()=>{
  try{
    for(const table of ["stock_movements","stock_reservations","deliveries","order_items","orders","customers","products","memberships","tenants"]){
      const key=table==="tenants"?"id":"tenant_id";
      await database.query(`DELETE FROM ${table} WHERE ${key}=ANY($1::uuid[])`,[[tenantId,otherTenantId]]);
    }
    await database.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[[userId,secondUserId]]);
  }finally{await database.end();}
});


async function confirmed(page:Page,items:{productId:string;quantity:number}[]){
  const id=await draft(page,items);expect((await confirm(page,id,await reviewed(page,id))).status()).toBe(200);return id;
}
async function expected(page:Page,id:string){return {version:(await read(page,id)).version};}
const deliver=(page:Page,id:string,data:{version:number})=>page.request.post(`${api}/${id}/deliver`,{headers,data});
const countDeliveries=async(id:string)=>Number((await database.query("SELECT count(*) FROM deliveries WHERE tenant_id=$1 AND order_id=$2",[tenantId,id])).rows[0].count);
const deliveryMovements=async(id:string)=>(await database.query("SELECT * FROM stock_movements WHERE tenant_id=$1 AND order_id=$2 AND kind='DELIVERY' ORDER BY product_id",[tenantId,id])).rows;
const reservationStates=async(id:string)=>(await database.query("SELECT * FROM stock_reservations WHERE tenant_id=$1 AND order_id=$2 ORDER BY product_id",[tenantId,id])).rows;

test("anonymous users cannot record complete deliveries",async({request})=>{
  expect((await request.post(`${api}/${randomUUID()}/deliver`,{headers,data:{version:3}})).status()).toBe(401);
});

test("employees record a complete mobile delivery with traceable movements and unchanged accepted totals",async({page})=>{
  await signIn(page);const p=await product(10),q=await product(4,100,"Delivery cable");
  const id=await confirmed(page,[{productId:p,quantity:3},{productId:q,quantity:2}]);const before=await read(page,id);
  await page.setViewportSize({width:375,height:812});await page.goto(`/tenants/${tenantId}/orders/${id}`);
  await page.getByRole("button",{name:"Record complete delivery",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Delivered order",exact:true})).toBeVisible();
  await expect(page.getByText("Recorded by: Delivery Test User",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Record complete delivery"})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const after=await read(page,id);expect(after.status).toBe("DELIVERED");expect(after.version).toBe(before.version+1);
  expect(after.totals).toEqual(before.totals);expect(after.confirmedAt).toBe(before.confirmedAt);expect(after.customer).toEqual(before.customer);
  expect(after.delivery.deliveredByMembershipId).toBe(membershipId);
  expect(await quantities(p)).toEqual({physical_quantity:7,reserved_quantity:0});expect(await quantities(q)).toEqual({physical_quantity:2,reserved_quantity:0});
  const reservations=await reservationStates(id);expect(reservations).toHaveLength(2);expect(reservations.every(r=>r.status==="CONSUMED"&&r.consumed_at.toISOString()===after.delivery.deliveredAt)).toBe(true);
  const movements=await deliveryMovements(id);expect(movements).toHaveLength(2);expect(movements.map(m=>m.quantity_delta).sort((a,b)=>a-b)).toEqual([-3,-2]);
  expect(movements.every(m=>m.recorded_by_membership_id===membershipId)).toBe(true);
  expect((await page.request.put(`${api}/${id}`,{headers,data:{version:after.version,customerId,items:[]}})).status()).toBe(409);
  expect((await page.request.post(`${api}/${id}/refresh-prices`,{headers,data:{version:after.version,prices:[]}})).status()).toBe(409);
  expect((await confirm(page,id,{version:2,taxVersion:before.taxVersion})).status()).toBe(409);
  await page.goto(`/tenants/${tenantId}/inventory/${p}`);
  await expect(page.getByRole("heading",{name:"Delivery: -3",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"View delivered order",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Delivered order",exact:true})).toBeVisible();
  await page.goto(`/tenants/${tenantId}/orders`);await expect(page.getByText("Status: Delivered",{exact:true})).toBeVisible();
});

test("administrator delivery consumes only its own reservations and leaves available stock unchanged",async({page})=>{
  await signIn(page);const p=await product(10);const a=await confirmed(page,[{productId:p,quantity:3}]),b=await confirmed(page,[{productId:p,quantity:4}]);
  const before=await quantities(p);expect(before).toEqual({physical_quantity:10,reserved_quantity:7});
  await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1",[membershipId]);
  try{
    expect((await deliver(page,a,await expected(page,a))).status()).toBe(200);
    expect(await quantities(p)).toEqual({physical_quantity:7,reserved_quantity:4});expect((await read(page,b)).status).toBe("CONFIRMED");
    expect((await reservationStates(a))[0].status).toBe("CONSUMED");expect((await reservationStates(b))[0].status).toBe("ACTIVE");
    const stock=await(await page.request.get(inventoryApi)).json();expect(stock.inventory.find((r:{id:string})=>r.id===p).availableQuantity).toBe(3);
  }finally{await database.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1",[membershipId]);}
});

test("concurrent delivery retries share one event and nonmatching actors or versions cannot replay",async({page,browser})=>{
  await signIn(page);const p=await product();const id=await confirmed(page,[{productId:p,quantity:2}]);const data=await expected(page,id);
  const responses=await Promise.all([deliver(page,id,data),deliver(page,id,data)]);expect(responses.map(r=>r.status())).toEqual([200,200]);
  const bodies=await Promise.all(responses.map(r=>r.json()));expect(bodies.map(b=>b.order.replayed).sort()).toEqual([false,true]);expect(bodies[0].delivery.id).toBe(bodies[1].delivery.id);
  expect(await countDeliveries(id)).toBe(1);expect(await deliveryMovements(id)).toHaveLength(1);expect(await quantities(p)).toEqual({physical_quantity:8,reserved_quantity:0});
  expect((await deliver(page,id.toUpperCase(),data)).status()).toBe(200);
  expect((await deliver(page,id,{version:data.version+1})).status()).toBe(409);
  const context=await browser.newContext({baseURL:headers.Origin});
  try{const other=await context.newPage();await signIn(other,secondEmail);expect((await deliver(other,id,data)).status()).toBe(409);}finally{await context.close();}
});

test("parallel complete deliveries of overlapping products preserve every physical movement",async({page})=>{
  await signIn(page);const p=await product(6),q=await product(6);const a=await confirmed(page,[{productId:p,quantity:3},{productId:q,quantity:3}]);
  const b=await confirmed(page,[{productId:q,quantity:2},{productId:p,quantity:2}]);const da=await expected(page,a),db=await expected(page,b);
  expect((await Promise.all([deliver(page,a,da),deliver(page,b,db)])).map(r=>r.status())).toEqual([200,200]);
  expect(await quantities(p)).toEqual({physical_quantity:1,reserved_quantity:0});expect(await quantities(q)).toEqual({physical_quantity:1,reserved_quantity:0});
  expect(await deliveryMovements(a)).toHaveLength(2);expect(await deliveryMovements(b)).toHaveLength(2);
});

test("delivery and another confirmation serialize without changing available stock incorrectly",async({page})=>{
  await signIn(page);const p=await product(8);const a=await confirmed(page,[{productId:p,quantity:3}]);const b=await draft(page,[{productId:p,quantity:4}]);
  const da=await expected(page,a),db=await reviewed(page,b);const responses=await Promise.all([deliver(page,a,da),confirm(page,b,db)]);
  expect(responses.map(r=>r.status())).toEqual([200,200]);expect(await quantities(p)).toEqual({physical_quantity:5,reserved_quantity:4});
  expect((await read(page,a)).status).toBe("DELIVERED");expect((await read(page,b)).status).toBe("CONFIRMED");
});

test("concurrent manual corrections respect reserved stock before and after delivery",async({page})=>{
  await signIn(page);const p=await product(10),q=await product(10);const a=await confirmed(page,[{productId:p,quantity:6}]),b=await confirmed(page,[{productId:q,quantity:6}]);
  await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1",[membershipId]);
  try{
    const adjust=(productId:string,quantityDelta:number)=>page.request.post(`${inventoryApi}/${productId}/movements`,{headers,data:{requestId:randomUUID(),quantityDelta,reason:"Concurrent delivery correction"}});
    const da=await expected(page,a),db=await expected(page,b);
    const rejected=await Promise.all([deliver(page,a,da),adjust(p,-5)]);expect(rejected.map(r=>r.status())).toEqual([200,409]);
    const allowed=await Promise.all([deliver(page,b,db),adjust(q,-4)]);expect(allowed.map(r=>r.status())).toEqual([200,201]);
    expect(await quantities(p)).toEqual({physical_quantity:4,reserved_quantity:0});expect(await quantities(q)).toEqual({physical_quantity:0,reserved_quantity:0});
  }finally{await database.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1",[membershipId]);}
});

test("draft and stale confirmed orders cannot be delivered",async({page})=>{
  await signIn(page);const p=await product();const draftId=await draft(page,[{productId:p,quantity:1}]);expect((await deliver(page,draftId,await expected(page,draftId))).status()).toBe(409);
  const id=await confirmed(page,[{productId:p,quantity:1}]);const data=await expected(page,id);expect((await deliver(page,id,{version:data.version-1})).status()).toBe(409);
  expect(await countDeliveries(id)).toBe(0);expect(await deliveryMovements(id)).toHaveLength(0);expect((await reservationStates(id))[0].status).toBe("ACTIVE");
});

test("delivery validates payloads, media types, methods and origins before writes",async({page})=>{
  await signIn(page);const p=await product();const id=await confirmed(page,[{productId:p,quantity:1}]);const data=await expected(page,id),url=`${api}/${id}/deliver`;
  for(const body of [{},{version:0},{version:"3"},{...data,items:[]},{...data,quantity:1},{...data,tenantId:otherTenantId},{...data,deliveredByMembershipId:membershipId},{...data,totalCents:0},{...data,status:"DELIVERED"}]){
    expect((await page.request.post(url,{headers,data:body})).status()).toBe(422);
  }
  expect((await page.request.post(url,{headers:{...headers,"Content-Type":"application/json"},data:Buffer.from("{")})).status()).toBe(400);
  expect((await page.request.post(url,{headers:{...headers,"Content-Type":"text/plain"},data:"bad"})).status()).toBe(415);
  expect((await page.request.post(url,{data})).status()).toBe(403);
  expect((await page.request.post(url,{headers:{Origin:"https://evil.example"},data})).status()).toBe(403);
  expect((await page.request.get(url)).status()).toBe(405);expect((await page.request.delete(url,{headers})).status()).toBe(405);
  expect((await deliver(page,"invalid",data)).status()).toBe(400);expect(await countDeliveries(id)).toBe(0);
});

test("foreign orders and revoked memberships cannot deliver or replay",async({page})=>{
  await signIn(page);const foreignOrder=randomUUID();await database.query("INSERT INTO orders (id,tenant_id,customer_id,created_by_membership_id,request_id,request_hash,updated_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)",[foreignOrder,otherTenantId,foreignCustomerId,foreignMembershipId,randomUUID(),"a".repeat(64)]);
  expect((await deliver(page,foreignOrder,{version:1})).status()).toBe(404);expect((await deliver(page,randomUUID(),{version:1})).status()).toBe(404);
  expect((await page.request.post(`/api/tenants/${otherTenantId}/orders/${foreignOrder}/deliver`,{headers,data:{version:1}})).status()).toBe(403);
  const p=await product();const id=await confirmed(page,[{productId:p,quantity:1}]);const data=await expected(page,id);
  await database.query("UPDATE memberships SET is_active=false WHERE id=$1",[membershipId]);
  try{expect((await deliver(page,id,data)).status()).toBe(403);expect(await countDeliveries(id)).toBe(0);}finally{await database.query("UPDATE memberships SET is_active=true WHERE id=$1",[membershipId]);}
  expect((await deliver(page,id,data)).status()).toBe(200);await database.query("UPDATE memberships SET is_active=false WHERE id=$1",[membershipId]);
  try{expect((await deliver(page,id,data)).status()).toBe(403);}finally{await database.query("UPDATE memberships SET is_active=true WHERE id=$1",[membershipId]);}
});

test("inconsistent reservation quantities, statuses and balances prevent delivery without partial state",async({page})=>{
  await signIn(page);const p=await product();const id=await confirmed(page,[{productId:p,quantity:3}]);const data=await expected(page,id);
  for(const change of ["UPDATE stock_reservations SET quantity=2 WHERE order_id=$1","UPDATE stock_reservations SET status='CONSUMED',consumed_at=CURRENT_TIMESTAMP WHERE order_id=$1","UPDATE inventory_balances SET reserved_quantity=0 WHERE product_id=$1"]){
    await database.query(change,change.includes("inventory_balances")?[p]:[id]);
    try{
      expect((await deliver(page,id,data)).status()).toBe(409);expect(await countDeliveries(id)).toBe(0);expect(await deliveryMovements(id)).toHaveLength(0);
      expect((await read(page,id)).status).toBe("CONFIRMED");expect((await read(page,id)).version).toBe(data.version);
    }finally{
      await database.query("UPDATE stock_reservations SET quantity=3,status='ACTIVE',consumed_at=NULL WHERE order_id=$1",[id]);
      await database.query("UPDATE inventory_balances SET reserved_quantity=3 WHERE product_id=$1",[p]);
    }
  }
  expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:3});
});

test("movement, reservation and final order failures roll back the entire delivery",async({page})=>{
  await signIn(page);const ids=[randomUUID(),randomUUID()].sort(),p=await product(10,100,"First rollback line",ids[0]),q=await product(10,100,"Second rollback line",ids[1]);
  const id=await confirmed(page,[{productId:p,quantity:2},{productId:q,quantity:2}]),data=await expected(page,id);
  for(const [table,operation,condition] of [["stock_movements","INSERT",`NEW.kind='DELIVERY' AND NEW.product_id='${q}'::uuid`],
    ["stock_reservations","UPDATE",`NEW.status='CONSUMED' AND NEW.product_id='${q}'::uuid`],
    ["orders","UPDATE",`NEW.status::text='DELIVERED' AND NEW.id='${id}'::uuid`]]){
    await database.query(`CREATE FUNCTION fail_delivery_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'Forced delivery test failure'; END IF; RETURN NEW; END $$`);
    try{
      await database.query(`CREATE TRIGGER fail_delivery_test BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_delivery_test()`);
      try{
        expect((await deliver(page,id,data)).status()).toBe(500);expect(await countDeliveries(id)).toBe(0);expect(await deliveryMovements(id)).toHaveLength(0);
        expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:2});expect(await quantities(q)).toEqual({physical_quantity:10,reserved_quantity:2});
        expect((await reservationStates(id)).every(r=>r.status==="ACTIVE"&&r.consumed_at===null)).toBe(true);expect((await read(page,id)).status).toBe("CONFIRMED");
      }finally{await database.query(`DROP TRIGGER fail_delivery_test ON ${table}`);}
    }finally{await database.query("DROP FUNCTION fail_delivery_test()");}
  }
});

test("a lost successful response recovers to the recorded delivery without another stock withdrawal",async({page})=>{
  await signIn(page);const p=await product();const id=await confirmed(page,[{productId:p,quantity:3}]),data=await expected(page,id);await page.goto(`/tenants/${tenantId}/orders/${id}`);
  const pattern=`**${api}/${id}/deliver`;await page.route(pattern,async route=>{expect((await route.fetch()).status()).toBe(200);await route.abort();});
  await page.getByRole("button",{name:"Record complete delivery",exact:true}).click();await expect(page.locator("main").getByRole("alert")).toContainText("Reload the order");
  await page.unroute(pattern);expect((await deliver(page,id,data)).status()).toBe(200);
  await page.getByRole("button",{name:"Reload order",exact:true}).click();await expect(page.getByRole("heading",{name:"Delivered order",exact:true})).toBeVisible();
  expect(await countDeliveries(id)).toBe(1);expect(await deliveryMovements(id)).toHaveLength(1);expect(await quantities(p)).toEqual({physical_quantity:7,reserved_quantity:0});
});

test("SQL rejects malformed lifecycle records and enforces tenant-safe delivery links",async({page})=>{
  await signIn(page);const p=await product();const id=await confirmed(page,[{productId:p,quantity:1}]);
  await expect(database.query("UPDATE stock_reservations SET status='CONSUMED' WHERE order_id=$1",[id])).rejects.toMatchObject({code:"23514",constraint:"stock_reservations_consumption_valid"});
  await expect(database.query("UPDATE stock_reservations SET consumed_at=CURRENT_TIMESTAMP WHERE order_id=$1",[id])).rejects.toMatchObject({code:"23514"});
  const event="INSERT INTO deliveries (tenant_id,order_id,delivered_by_membership_id) VALUES ($1,$2,$3)";
  await expect(database.query(event,[otherTenantId,id,foreignMembershipId])).rejects.toMatchObject({code:"23503"});
  await expect(database.query(event,[tenantId,id,foreignMembershipId])).rejects.toMatchObject({code:"23503"});
  expect((await deliver(page,id,await expected(page,id))).status()).toBe(200);
  await expect(database.query(event,[tenantId,id,membershipId])).rejects.toMatchObject({code:"23505"});
  const movement="INSERT INTO stock_movements (tenant_id,product_id,request_id,quantity_delta,reason,recorded_by_membership_id,kind,order_id) VALUES ($1,$2,$3,$4,'SQL shape test',$5,$6,$7)";
  for(const [kind,order,delta] of [["DELIVERY",null,-1],["DELIVERY",id,1],["DELIVERY",id,-1000001],["ADJUSTMENT",id,-1]]){
    await expect(database.query(movement,[tenantId,p,randomUUID(),delta,membershipId,kind,order])).rejects.toMatchObject({code:"23514",constraint:"stock_movements_kind_valid"});
  }
  const unused=await product();await expect(database.query(movement,[tenantId,unused,randomUUID(),-1,membershipId,"DELIVERY",id])).rejects.toMatchObject({code:"23503"});
  await expect(database.query("UPDATE orders SET total_cents=NULL WHERE id=$1",[id])).rejects.toMatchObject({code:"23514",constraint:"orders_confirmation_snapshot_valid"});
  await expect(database.query("DELETE FROM deliveries WHERE order_id=$1",[id])).rejects.toMatchObject({code:"23001"});
});

test("delivery preserves maximum accepted totals after price, tax and customer changes",async({page})=>{
  await signIn(page);const p=await product(1,2147483647);await database.query("UPDATE tenants SET tax_rate_bps=10000,tax_version=tax_version+1 WHERE id=$1",[tenantId]);
  try{
    const id=await confirmed(page,[{productId:p,quantity:1}]),before=await read(page,id);expect(before.totals.totalCents).toBe(4294967294);
    await database.query("UPDATE tenants SET tax_rate_bps=0,tax_version=tax_version+1 WHERE id=$1",[tenantId]);await database.query("UPDATE products SET unit_price_cents=1 WHERE id=$1",[p]);
    await database.query("UPDATE customers SET company_name='Changed customer' WHERE id=$1",[customerId]);
    expect((await deliver(page,id,{version:before.version})).status()).toBe(200);const after=await read(page,id);
    expect(after.totals).toEqual(before.totals);expect(after.totalCents).toBe(4294967294);expect(after.customer).toEqual(before.customer);expect(after.items[0].unitPriceCents).toBe(2147483647);
    expect(await quantities(p)).toEqual({physical_quantity:0,reserved_quantity:0});
  }finally{await database.query("UPDATE tenants SET tax_rate_bps=1000,tax_version=tax_version+1 WHERE id=$1",[tenantId]);await database.query("UPDATE customers SET company_name='Delivery Client' WHERE id=$1",[customerId]);}
});

test("a stale draft editor reloads to a delivered order and cannot restore editable state",async({page})=>{
  await signIn(page);const p=await product();const id=await draft(page,[{productId:p,quantity:1}]);await page.goto(`/tenants/${tenantId}/orders/${id}`);
  expect((await confirm(page,id,await reviewed(page,id))).status()).toBe(200);expect((await deliver(page,id,await expected(page,id))).status()).toBe(200);
  await page.getByRole("button",{name:"Reload draft",exact:true}).click();await expect(page.getByRole("heading",{name:"Delivered order",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Save draft"})).toHaveCount(0);
});

test("delivery history remains paginated and delivery identifiers cannot replay manual adjustments",async({page})=>{
  await signIn(page);const p=await product(10);const id=await confirmed(page,[{productId:p,quantity:1}]);
  await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1",[membershipId]);
  try{
    const url=`${inventoryApi}/${p}/movements`;
    for(let n=0;n<21;n++)expect((await page.request.post(url,{headers,data:{requestId:randomUUID(),quantityDelta:1,reason:`Receipt ${n}`}})).status()).toBe(201);
    expect((await deliver(page,id,await expected(page,id))).status()).toBe(200);
    const first=await(await page.request.get(url)).json(),second=await(await page.request.get(`${url}?page=2`)).json();
    expect(first.movements).toHaveLength(20);expect(second.movements).toHaveLength(3);expect(first.movements[0]).toMatchObject({kind:"DELIVERY",orderId:id,quantityDelta:-1});
    const movement=first.movements[0];expect((await page.request.post(url,{headers,data:{requestId:movement.requestId,quantityDelta:movement.quantityDelta,reason:movement.reason}})).status()).toBe(409);
    expect(await quantities(p)).toEqual({physical_quantity:30,reserved_quantity:0});
  }finally{await database.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1",[membershipId]);}
});
