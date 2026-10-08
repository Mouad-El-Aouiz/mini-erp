import { test } from "node:test";
import assert from "node:assert/strict";
import { createDraftSchema, updateDraftSchema, orderQuantityTextSchema, refreshPricesSchema, taxSettingsSchema, taxPercentSchema } from "../../src/lib/validation/order";
const id="A1B2C3D4-1234-4321-ABCD-123456789ABC";
test("draft schemas normalize IDs and reject client-owned prices and totals",()=>{
  assert.equal(createDraftSchema.parse({customerId:id,requestId:id}).customerId,id.toLowerCase());
  assert.equal(updateDraftSchema.safeParse({version:1,customerId:id,items:[]}).success,true);
  const base={version:1,customerId:id,items:[{productId:id,quantity:1}]};
  for(const change of [{version:0},{version:"1"},{items:[{productId:id,quantity:0}]},{items:[{productId:id,quantity:1,unitPriceCents:1}]},{totalCents:1},{tenantId:id}]) assert.equal(updateDraftSchema.safeParse({...base,...change}).success,false);
  assert.equal(updateDraftSchema.safeParse({...base,items:[{productId:id,quantity:1},{productId:id.toLowerCase(),quantity:2}]}).success,false);
  assert.equal(updateDraftSchema.safeParse({...base,items:Array.from({length:101},()=>({productId:id,quantity:1}))}).success,false);
});
test("explicit price acceptance and tax settings enforce bounds",()=>{
  assert.equal(refreshPricesSchema.safeParse({version:1,prices:[{productId:id,unitPriceCents:10}]}).success,true);
  assert.equal(refreshPricesSchema.safeParse({version:1,prices:[{productId:id,unitPriceCents:-1}]}).success,false);
  assert.equal(taxSettingsSchema.safeParse({version:1,taxRateBps:10000}).success,true);
  assert.equal(taxSettingsSchema.safeParse({version:1,taxRateBps:10001}).success,false);
  for(const [value,bps] of [["10",1000],["12.34",1234],["0",0],["100.00",10000]] as const) assert.equal(taxPercentSchema.parse(value),bps);
  for(const value of ["100.01","1.001","1,5","-1","1e2",""]) assert.equal(taxPercentSchema.safeParse(value).success,false);
});

test("order quantity text rejects loose numeric coercion",()=>{
  for(const text of ["0","1e2","0x10","1.5","01","","1000001"])assert.equal(orderQuantityTextSchema.safeParse(text).success,false);
  assert.equal(orderQuantityTextSchema.parse("1000000"),1000000);
});
