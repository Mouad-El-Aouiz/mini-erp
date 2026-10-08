import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";

const database=new Pool({connectionString:process.env.DATABASE_URL});
const tenantId=randomUUID(),otherTenantId=randomUUID(),userId=randomUUID(),secondUserId=randomUUID();
const membershipId=randomUUID(),foreignMembershipId=randomUUID(),secondMembershipId=randomUUID();
const customerId=randomUUID(),foreignCustomerId=randomUUID();
const email=`cancellation-${userId}@example.test`,secondEmail=`cancellation-${secondUserId}@example.test`;
const password="Cancellation-tests-only-password-2026!";
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
async function product(physical=10,price=3900,name="Cancellation laptop",id=randomUUID()) {
  await database.query("INSERT INTO products (id,tenant_id,sku,name,unit_price_cents,updated_at) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)",[id,tenantId,`CANCELLATION-${id.toUpperCase()}`,name,price]);
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
      await tx.query('INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',[id,"Cancellation Test User",address]);
      await tx.query('INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',[randomUUID(),id,"credential",id,await hashPassword(password)]);
    }
    for(const id of [tenantId,otherTenantId]) await tx.query("INSERT INTO tenants (id,name,updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)",[id,"Cancellation Test Company"]);
    for(const [id,tenant,user,active] of [[membershipId,tenantId,userId,true],[secondMembershipId,tenantId,secondUserId,true],[foreignMembershipId,otherTenantId,userId,false]]){
      await tx.query("INSERT INTO memberships (id,tenant_id,user_id,role,is_active,updated_at) VALUES ($1,$2,$3,'ADMIN',$4,CURRENT_TIMESTAMP)",[id,tenant,user,active]);
    }
    for(const [id,tenant] of [[customerId,tenantId],[foreignCustomerId,otherTenantId]])await tx.query("INSERT INTO customers (id,tenant_id,company_name,updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)",[id,tenant,"Cancellation Client"]);
    await tx.query("COMMIT");
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
});
test.afterAll(async()=>{
  try{
    for(const table of ["stock_movements","stock_reservations","deliveries","cancellations","order_items","orders","customers","products","memberships","tenants"]){
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
const reservationStates=async(id:string)=>(await database.query("SELECT * FROM stock_reservations WHERE tenant_id=$1 AND order_id=$2 ORDER BY product_id",[tenantId,id])).rows;


const reason = "Customer withdrew the purchase request";
const cancel = (page:Page,id:string,data:{version:number;reason:string}) => page.request.post(`${api}/${id}/cancel`,{headers,data});
const command = async(page:Page,id:string) => ({...await expected(page,id),reason});
const countCancellations = async(id:string) => Number((await database.query("SELECT count(*) FROM cancellations WHERE tenant_id=$1 AND order_id=$2",[tenantId,id])).rows[0].count);
const movementCount = async(productId:string) => Number((await database.query("SELECT count(*) FROM stock_movements WHERE tenant_id=$1 AND product_id=$2",[tenantId,productId])).rows[0].count);

test("anonymous users and employees cannot cancel, and the employee interface exposes no cancellation action",async({page,request})=>{
  expect((await request.post(`${api}/${randomUUID()}/cancel`,{headers,data:{version:3,reason}})).status()).toBe(401);
  await signIn(page);const p=await product();const id=await confirmed(page,[{productId:p,quantity:2}]),data=await command(page,id);
  await database.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1",[membershipId]);
  try {
    expect((await cancel(page,id,data)).status()).toBe(403);
    await page.goto(`/tenants/${tenantId}/orders/${id}`);
    await expect(page.getByRole("button",{name:"Cancel confirmed order",exact:true})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Record complete delivery",exact:true})).toBeVisible();
    expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:2});expect(await countCancellations(id)).toBe(0);
  } finally {await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1",[membershipId]);}
});

test("administrators cancel complete mobile orders with retained history, unchanged physical stock and preserved other reservations",async({page})=>{
  await signIn(page);const p=await product(10),q=await product(8,100,"Cancellation cable");
  const id=await confirmed(page,[{productId:p,quantity:3},{productId:q,quantity:2}]);const other=await confirmed(page,[{productId:p,quantity:4}]);
  const before=await read(page,id);expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:7});
  await page.setViewportSize({width:375,height:812});await page.goto(`/tenants/${tenantId}/orders/${id}`);
  await page.getByLabel("Cancellation reason",{exact:true}).fill(`  ${reason}  `);
  await page.getByRole("button",{name:"Cancel confirmed order",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Cancelled order",exact:true})).toBeVisible();
  await expect(page.getByText("Cancelled by: Cancellation Test User",{exact:true})).toBeVisible();
  await expect(page.getByText(`Reason: ${reason}`,{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Cancel confirmed order",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Record complete delivery",exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const after=await read(page,id);expect(after.status).toBe("CANCELLED");expect(after.version).toBe(before.version+1);
  expect(after.totals).toEqual(before.totals);expect(after.customer).toEqual(before.customer);expect(after.confirmedAt).toBe(before.confirmedAt);expect(after.delivery).toBeNull();
  expect(after.cancellation).toMatchObject({reason,cancelledByMembershipId:membershipId});
  const reservations=await reservationStates(id);expect(reservations).toHaveLength(2);
  expect(reservations.every(r=>r.status==="RELEASED"&&r.consumed_at===null&&r.released_at.toISOString()===after.cancellation.cancelledAt)).toBe(true);
  expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:4});expect(await quantities(q)).toEqual({physical_quantity:8,reserved_quantity:0});
  expect(await movementCount(p)).toBe(1);expect(await movementCount(q)).toBe(1);expect(await countDeliveries(id)).toBe(0);
  expect((await reservationStates(other))[0].status).toBe("ACTIVE");
  const stock=await(await page.request.get(inventoryApi)).json();expect(stock.inventory.find((r:{id:string})=>r.id===p).availableQuantity).toBe(6);
  expect((await deliver(page,id,{version:after.version})).status()).toBe(409);
  expect((await confirm(page,id,{version:2,taxVersion:before.taxVersion})).status()).toBe(409);
  expect((await page.request.put(`${api}/${id}`,{headers,data:{version:after.version,customerId,items:[]}})).status()).toBe(409);
  expect((await page.request.post(`${api}/${id}/refresh-prices`,{headers,data:{version:after.version,prices:[]}})).status()).toBe(409);
  await page.goto(`/tenants/${tenantId}/orders`);await expect(page.getByText("Status: Cancelled",{exact:true})).toBeVisible();
});

test("exact concurrent retries share one cancellation and changed reasons, actors or versions conflict",async({page,browser})=>{
  await signIn(page);const p=await product(),id=await confirmed(page,[{productId:p,quantity:3}]),data=await command(page,id);
  const responses=await Promise.all([cancel(page,id,data),cancel(page,id,{...data,reason:`  ${reason}  `})]);
  expect(responses.map(r=>r.status())).toEqual([200,200]);const results=await Promise.all(responses.map(r=>r.json()));
  expect(results[0].cancellation).toEqual(results[1].cancellation);expect(results.map(r=>r.order.replayed).sort()).toEqual([false,true]);
  expect((await(await cancel(page,id.toUpperCase(),data)).json()).order.replayed).toBe(true);
  expect((await cancel(page,id,{...data,reason:"Changed reason"})).status()).toBe(409);
  expect((await cancel(page,id,{...data,version:data.version+1})).status()).toBe(409);
  const context=await browser.newContext();try {const second=await context.newPage();await signIn(second,secondEmail);expect((await cancel(second,id,data)).status()).toBe(409);}finally{await context.close();}
  expect(await countCancellations(id)).toBe(1);expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:0});expect(await movementCount(p)).toBe(1);
});

test("drafts, delivered orders and stale versions cannot be cancelled",async({page})=>{
  await signIn(page);const p=await product();const draftId=await draft(page,[{productId:p,quantity:1}]);
  expect((await cancel(page,draftId,await command(page,draftId))).status()).toBe(409);
  const id=await confirmed(page,[{productId:p,quantity:1}]);const data=await command(page,id);
  expect((await cancel(page,id,{...data,version:data.version-1})).status()).toBe(409);expect(await countCancellations(id)).toBe(0);
  expect((await deliver(page,id,{version:data.version})).status()).toBe(200);
  expect((await cancel(page,id,{...data,version:data.version+1})).status()).toBe(409);
  expect(await countCancellations(id)).toBe(0);expect(await quantities(p)).toEqual({physical_quantity:9,reserved_quantity:0});
  await page.goto(`/tenants/${tenantId}/orders/${id}`);await expect(page.getByRole("button",{name:"Cancel confirmed order",exact:true})).toHaveCount(0);
});

test("competing cancellation retries and delivery produce exactly one terminal outcome",async({page})=>{
  await signIn(page);
  for(let n=0;n<4;n++){
    const p=await product(),id=await confirmed(page,[{productId:p,quantity:3}]),data=await command(page,id);
    const responses=await Promise.all([cancel(page,id,data),deliver(page,id,{version:data.version}),cancel(page,id,data)]);
    const order=await read(page,id);expect(order.version).toBe(data.version+1);
    if(order.status==="CANCELLED"){
      expect(responses.map(r=>r.status())).toEqual([200,409,200]);expect(await countCancellations(id)).toBe(1);expect(await countDeliveries(id)).toBe(0);
      expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:0});expect(await movementCount(p)).toBe(1);expect((await reservationStates(id))[0].status).toBe("RELEASED");
    }else{
      expect(order.status).toBe("DELIVERED");expect(responses.map(r=>r.status())).toEqual([409,200,409]);expect(await countCancellations(id)).toBe(0);expect(await countDeliveries(id)).toBe(1);
      expect(await quantities(p)).toEqual({physical_quantity:7,reserved_quantity:0});expect(await movementCount(p)).toBe(2);expect((await reservationStates(id))[0].status).toBe("CONSUMED");
    }
  }
});

test("parallel cancellations of overlapping products retain physical history and release both orders",async({page})=>{
  await signIn(page);const p=await product(10),q=await product(10);
  const a=await confirmed(page,[{productId:p,quantity:3},{productId:q,quantity:2}]),b=await confirmed(page,[{productId:q,quantity:4},{productId:p,quantity:5}]);
  const da=await command(page,a),db=await command(page,b);
  expect((await Promise.all([cancel(page,a,da),cancel(page,b,db)])).map(r=>r.status())).toEqual([200,200]);
  for(const id of [p,q]){expect(await quantities(id)).toEqual({physical_quantity:10,reserved_quantity:0});expect(await movementCount(id)).toBe(1);}
});

test("cancellation makes stock available to a competing confirmation without losing reservations",async({page})=>{
  await signIn(page);const p=await product(10),a=await confirmed(page,[{productId:p,quantity:6}]),b=await draft(page,[{productId:p,quantity:6}]);
  const da=await command(page,a),db=await reviewed(page,b);const responses=await Promise.all([cancel(page,a,da),confirm(page,b,db)]);
  expect(responses[0].status()).toBe(200);expect([200,409]).toContain(responses[1].status());
  expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:responses[1].status()===200?6:0});
  if(responses[1].status()===409)expect((await confirm(page,b,await reviewed(page,b))).status()).toBe(200);
  expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:6});expect(await movementCount(p)).toBe(1);
  expect((await reservationStates(a))[0].status).toBe("RELEASED");expect((await reservationStates(b))[0].status).toBe("ACTIVE");
});

test("manual withdrawal competes safely with reservation release and can retry after release",async({page})=>{
  await signIn(page);const p=await product(10),id=await confirmed(page,[{productId:p,quantity:6}]),data=await command(page,id);
  const adjustment={requestId:randomUUID(),quantityDelta:-5,reason:"Correction after reservation release"};
  const adjust=()=>page.request.post(`${inventoryApi}/${p}/movements`,{headers,data:adjustment});
  const responses=await Promise.all([cancel(page,id,data),adjust()]);expect(responses[0].status()).toBe(200);expect([201,409]).toContain(responses[1].status());
  expect(await quantities(p)).toEqual({physical_quantity:responses[1].status()===201?5:10,reserved_quantity:0});
  const retry=await adjust();expect(retry.status()).toBe(responses[1].status()===201?200:201);
  expect(await quantities(p)).toEqual({physical_quantity:5,reserved_quantity:0});expect(await movementCount(p)).toBe(2);
});

test("tenant ownership, revocation and demotion apply to cancellation and successful retries",async({page})=>{
  await signIn(page);const foreignOrder=randomUUID();await database.query("INSERT INTO orders (id,tenant_id,customer_id,created_by_membership_id,request_id,request_hash,updated_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)",[foreignOrder,otherTenantId,foreignCustomerId,foreignMembershipId,randomUUID(),"a".repeat(64)]);
  expect((await cancel(page,foreignOrder,{version:1,reason})).status()).toBe(404);expect((await cancel(page,randomUUID(),{version:1,reason})).status()).toBe(404);
  expect((await page.request.post(`/api/tenants/${otherTenantId}/orders/${foreignOrder}/cancel`,{headers,data:{version:1,reason}})).status()).toBe(403);
  const p=await product(),id=await confirmed(page,[{productId:p,quantity:1}]),data=await command(page,id);
  for(const change of ["role='EMPLOYEE'","is_active=false"]){
    await database.query(`UPDATE memberships SET ${change} WHERE id=$1`,[membershipId]);
    try{expect((await cancel(page,id,data)).status()).toBe(403);expect(await countCancellations(id)).toBe(0);}finally{await database.query("UPDATE memberships SET role='ADMIN',is_active=true WHERE id=$1",[membershipId]);}
  }
  expect((await cancel(page,id,data)).status()).toBe(200);
  for(const change of ["role='EMPLOYEE'","is_active=false"]){
    await database.query(`UPDATE memberships SET ${change} WHERE id=$1`,[membershipId]);
    try{expect((await cancel(page,id,data)).status()).toBe(403);}finally{await database.query("UPDATE memberships SET role='ADMIN',is_active=true WHERE id=$1",[membershipId]);}
  }
  expect((await cancel(page,id,data)).status()).toBe(200);expect(await countCancellations(id)).toBe(1);
});

test("cancellation validates reasons, payloads, JSON, media types, methods and origins before writes",async({page})=>{
  await signIn(page);const p=await product(),id=await confirmed(page,[{productId:p,quantity:2}]),data=await command(page,id),url=`${api}/${id}/cancel`;
  for(const body of [{},{version:0,reason},{version:"3",reason},{version:2147483647,reason},{...data,reason:" "},{...data,reason:42},
    {...data,reason:"x".repeat(501)},{...data,reason:"bad\u0000reason"},{...data,items:[]},{...data,quantity:1},{...data,tenantId:otherTenantId},
    {...data,cancelledByMembershipId:membershipId},{...data,cancelledAt:"client"},{...data,totalCents:0},{...data,status:"CANCELLED"}]){
    expect((await page.request.post(url,{headers,data:body})).status()).toBe(422);
  }
  expect((await page.request.post(url,{headers:{...headers,"Content-Type":"application/json"},data:Buffer.from("{")})).status()).toBe(400);
  expect((await page.request.post(url,{headers:{...headers,"Content-Type":"text/plain"},data:"bad"})).status()).toBe(415);
  expect((await page.request.post(url,{data})).status()).toBe(403);expect((await page.request.post(url,{headers:{Origin:"https://evil.example"},data})).status()).toBe(403);
  expect((await page.request.get(url)).status()).toBe(405);expect((await page.request.delete(url,{headers})).status()).toBe(405);
  expect((await cancel(page,"invalid",data)).status()).toBe(400);expect(await countCancellations(id)).toBe(0);expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:2});
});

test("inconsistent, consumed or missing reservations and balances prevent partial cancellation",async({page})=>{
  await signIn(page);const p=await product(),id=await confirmed(page,[{productId:p,quantity:3}]),data=await command(page,id);
  for(const change of ["UPDATE stock_reservations SET quantity=2 WHERE order_id=$1",
    "UPDATE stock_reservations SET status='CONSUMED',consumed_at=CURRENT_TIMESTAMP WHERE order_id=$1",
    "UPDATE stock_reservations SET status='RELEASED',released_at=CURRENT_TIMESTAMP WHERE order_id=$1",
    "UPDATE inventory_balances SET reserved_quantity=0 WHERE product_id=$1",
    "DELETE FROM inventory_balances WHERE product_id=$1"]){
    await database.query(change,change.includes("inventory_balances")?[p]:[id]);
    try{expect((await cancel(page,id,data)).status()).toBe(409);expect(await countCancellations(id)).toBe(0);expect((await read(page,id)).status).toBe("CONFIRMED");}
    finally{
      await database.query("UPDATE stock_reservations SET quantity=3,status='ACTIVE',consumed_at=NULL,released_at=NULL WHERE order_id=$1",[id]);
      await database.query("INSERT INTO inventory_balances (tenant_id,product_id,physical_quantity,reserved_quantity,updated_at) VALUES ($1,$2,10,3,CURRENT_TIMESTAMP) ON CONFLICT (tenant_id,product_id) DO UPDATE SET reserved_quantity=3",[tenantId,p]);
    }
  }
  const reservation=(await reservationStates(id))[0];await database.query("DELETE FROM stock_reservations WHERE order_id=$1",[id]);
  try{expect((await cancel(page,id,data)).status()).toBe(409);expect(await countCancellations(id)).toBe(0);}finally{
    await database.query("INSERT INTO stock_reservations (tenant_id,order_id,product_id,quantity,created_at) VALUES ($1,$2,$3,3,$4)",[tenantId,id,p,reservation.created_at]);
  }
  expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:3});expect(await movementCount(p)).toBe(1);
});

test("event, balance, reservation and final order failures roll back the entire cancellation",async({page})=>{
  await signIn(page);const ids=[randomUUID(),randomUUID()].sort(),p=await product(10,100,"First rollback line",ids[0]),q=await product(10,100,"Second rollback line",ids[1]);
  const id=await confirmed(page,[{productId:p,quantity:2},{productId:q,quantity:2}]),data=await command(page,id);
  for(const [table,operation,condition] of [["cancellations","INSERT",`NEW.order_id='${id}'::uuid`],
    ["inventory_balances","UPDATE",`NEW.product_id='${q}'::uuid`],
    ["stock_reservations","UPDATE",`NEW.status::text='RELEASED' AND NEW.product_id='${q}'::uuid`],
    ["orders","UPDATE",`NEW.status::text='CANCELLED' AND NEW.id='${id}'::uuid`]]){
    await database.query(`CREATE FUNCTION fail_cancellation_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'Forced cancellation test failure'; END IF; RETURN NEW; END $$`);
    try{
      await database.query(`CREATE TRIGGER fail_cancellation_test BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_cancellation_test()`);
      try{
        expect((await cancel(page,id,data)).status()).toBe(500);expect(await countCancellations(id)).toBe(0);
        for(const productId of [p,q]){expect(await quantities(productId)).toEqual({physical_quantity:10,reserved_quantity:2});expect(await movementCount(productId)).toBe(1);}
        expect((await reservationStates(id)).every(r=>r.status==="ACTIVE"&&r.released_at===null)).toBe(true);
        const order=await read(page,id);expect(order.status).toBe("CONFIRMED");expect(order.version).toBe(data.version);
      }finally{await database.query(`DROP TRIGGER fail_cancellation_test ON ${table}`);}
    }finally{await database.query("DROP FUNCTION fail_cancellation_test()");}
  }
});

test("network failures preserve the reason and lost successful responses recover without releasing twice",async({page})=>{
  await signIn(page);const p=await product(),id=await confirmed(page,[{productId:p,quantity:3}]),data=await command(page,id);await page.goto(`/tenants/${tenantId}/orders/${id}`);
  const form=page.getByRole("form",{name:"Order cancellation"}),pattern=`**${api}/${id}/cancel`;await page.getByLabel("Cancellation reason",{exact:true}).fill(reason);
  await page.route(pattern,route=>route.abort());await form.getByRole("button",{name:"Cancel confirmed order",exact:true}).click();
  await expect(form.getByRole("alert")).toContainText("Reload the order");await expect(page.getByLabel("Cancellation reason",{exact:true})).toHaveValue(reason);expect(await countCancellations(id)).toBe(0);
  await page.unroute(pattern);await page.route(pattern,async route=>{expect((await route.fetch()).status()).toBe(200);await route.abort();});
  await form.getByRole("button",{name:"Cancel confirmed order",exact:true}).click();await expect(form.getByRole("alert")).toContainText("Reload the order");
  await page.unroute(pattern);expect((await cancel(page,id,data)).status()).toBe(200);
  await form.getByRole("button",{name:"Reload before cancellation",exact:true}).click();await expect(page.getByRole("heading",{name:"Cancelled order",exact:true})).toBeVisible();
  expect(await countCancellations(id)).toBe(1);expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:0});expect(await movementCount(p)).toBe(1);
});

test("stale cancellation forms retain the reason and recover after an explicit reload",async({page})=>{
  await signIn(page);const p=await product(),id=await confirmed(page,[{productId:p,quantity:1}]);await page.goto(`/tenants/${tenantId}/orders/${id}`);
  await page.getByLabel("Cancellation reason",{exact:true}).fill(reason);await database.query("UPDATE orders SET version=version+1 WHERE id=$1",[id]);
  const form=page.getByRole("form",{name:"Order cancellation"});await form.getByRole("button",{name:"Cancel confirmed order",exact:true}).click();
  await expect(form.getByRole("alert")).toContainText("Reload it");await expect(page.getByLabel("Cancellation reason",{exact:true})).toHaveValue(reason);
  await form.getByRole("button",{name:"Reload before cancellation",exact:true}).click();await expect(page.getByText("Status: Confirmed · Version: 4",{exact:true})).toBeVisible();
  await form.getByRole("button",{name:"Cancel confirmed order",exact:true}).click();await expect(page.getByRole("heading",{name:"Cancelled order",exact:true})).toBeVisible();
});

test("cancelled snapshots keep maximum accepted totals and employees can read a literal HTML reason safely",async({page})=>{
  await signIn(page);const p=await product(1,2147483647);await database.query("UPDATE tenants SET tax_rate_bps=10000,tax_version=tax_version+1 WHERE id=$1",[tenantId]);
  try{
    const id=await confirmed(page,[{productId:p,quantity:1}]),before=await read(page,id);expect(before.totals.totalCents).toBe(4294967294);
    await database.query("UPDATE tenants SET tax_rate_bps=0,tax_version=tax_version+1 WHERE id=$1",[tenantId]);await database.query("UPDATE products SET unit_price_cents=1 WHERE id=$1",[p]);await database.query("UPDATE customers SET company_name='Changed customer' WHERE id=$1",[customerId]);
    const text="<script>alert('cancel')</script> Customer withdrew order";expect((await cancel(page,id,{version:before.version,reason:text})).status()).toBe(200);
    await database.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1",[membershipId]);
    const after=await read(page,id);expect(after.totals).toEqual(before.totals);expect(after.totalCents).toBe(4294967294);expect(after.customer).toEqual(before.customer);expect(after.items[0].unitPriceCents).toBe(2147483647);
    await page.goto(`/tenants/${tenantId}/orders/${id}`);await expect(page.getByText(`Reason: ${text}`,{exact:true})).toBeVisible();await expect(page.locator("main script")).toHaveCount(0);
    expect(await quantities(p)).toEqual({physical_quantity:1,reserved_quantity:0});expect(await movementCount(p)).toBe(1);
  }finally{await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1",[membershipId]);await database.query("UPDATE tenants SET tax_rate_bps=1000,tax_version=tax_version+1 WHERE id=$1",[tenantId]);await database.query("UPDATE customers SET company_name='Cancellation Client' WHERE id=$1",[customerId]);}
});

test("SQL rejects invalid release dates, cancellation reasons and cross-tenant event references",async({page})=>{
  await signIn(page);const p=await product(),id=await confirmed(page,[{productId:p,quantity:1}]);
  for(const change of ["status='RELEASED'","released_at=CURRENT_TIMESTAMP","status='CONSUMED',consumed_at=CURRENT_TIMESTAMP,released_at=CURRENT_TIMESTAMP","status='RELEASED',consumed_at=CURRENT_TIMESTAMP,released_at=CURRENT_TIMESTAMP"]){
    await expect(database.query(`UPDATE stock_reservations SET ${change} WHERE order_id=$1`,[id])).rejects.toMatchObject({code:"23514",constraint:"stock_reservations_consumption_valid"});
  }
  const event="INSERT INTO cancellations (tenant_id,order_id,cancelled_by_membership_id,reason) VALUES ($1,$2,$3,$4)";
  await expect(database.query(event,[otherTenantId,id,foreignMembershipId,reason])).rejects.toMatchObject({code:"23503"});
  await expect(database.query(event,[tenantId,id,foreignMembershipId,reason])).rejects.toMatchObject({code:"23503"});
  for(const invalid of [""," \n\t","x".repeat(501)])await expect(database.query(event,[tenantId,id,membershipId,invalid])).rejects.toMatchObject({code:"23514",constraint:"cancellations_reason_valid"});
  expect((await cancel(page,id,await command(page,id))).status()).toBe(200);
  await expect(database.query(event,[tenantId,id,membershipId,reason])).rejects.toMatchObject({code:"23505"});
  await expect(database.query("UPDATE orders SET total_cents=NULL WHERE id=$1",[id])).rejects.toMatchObject({code:"23514",constraint:"orders_confirmation_snapshot_valid"});
  await expect(database.query("UPDATE stock_reservations SET released_at=NULL WHERE order_id=$1",[id])).rejects.toMatchObject({code:"23514"});
});

test("stale draft and delivery screens reload to cancellation without restoring controls",async({page})=>{
  await signIn(page);const p=await product(),id=await draft(page,[{productId:p,quantity:1}]);await page.goto(`/tenants/${tenantId}/orders/${id}`);
  expect((await confirm(page,id,await reviewed(page,id))).status()).toBe(200);expect((await cancel(page,id,await command(page,id))).status()).toBe(200);
  await page.getByRole("button",{name:"Reload draft",exact:true}).click();await expect(page.getByRole("heading",{name:"Cancelled order",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Save draft",exact:true})).toHaveCount(0);
  const other=await confirmed(page,[{productId:p,quantity:1}]);await page.goto(`/tenants/${tenantId}/orders/${other}`);
  expect((await cancel(page,other,await command(page,other))).status()).toBe(200);
  await page.getByRole("button",{name:"Record complete delivery",exact:true}).click();
  const deliveryPanel=page.locator("section").filter({has:page.getByRole("heading",{name:"Complete delivery",exact:true})});
  await expect(deliveryPanel.getByRole("alert")).toContainText("Only confirmed orders");
  await page.getByRole("button",{name:"Reload order",exact:true}).click();await expect(page.getByRole("heading",{name:"Cancelled order",exact:true})).toBeVisible();
  expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:0});
});

test("administrator demotion waits for an authorized cancellation transaction to finish",async({page})=>{
  await signIn(page);const p=await product(),id=await confirmed(page,[{productId:p,quantity:1}]),data=await command(page,id);
  const blocker=await database.connect();let open=false;
  let writing:ReturnType<typeof cancel>|undefined;
  let demoting:Promise<unknown>|undefined;
  try{
    await blocker.query("BEGIN");open=true;await blocker.query("SELECT id FROM products WHERE id=$1 FOR UPDATE",[p]);
    writing=cancel(page,id,data);
    await expect.poll(async()=>Number((await database.query("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND state='active' AND query LIKE '%FROM products%' AND query LIKE '%FOR UPDATE%'")).rows[0].count)).toBeGreaterThan(0);
    demoting=database.query("UPDATE memberships SET role='EMPLOYEE' WHERE id=$1",[membershipId]);
    await expect.poll(async()=>Number((await database.query("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND state='active' AND query LIKE 'UPDATE memberships SET role=%'")).rows[0].count)).toBeGreaterThan(0);
    await blocker.query("COMMIT");open=false;expect((await writing).status()).toBe(200);await demoting;
    expect((await cancel(page,id,data)).status()).toBe(403);expect(await countCancellations(id)).toBe(1);expect(await quantities(p)).toEqual({physical_quantity:10,reserved_quantity:0});
  }finally{
    if(open)await blocker.query("ROLLBACK");blocker.release();
    if(writing)await writing.catch(()=>{});if(demoting)await demoting.catch(()=>{});
    await database.query("UPDATE memberships SET role='ADMIN' WHERE id=$1",[membershipId]);
  }
});
