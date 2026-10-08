import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverOrderSchema } from "../../src/lib/validation/order";
import { consumeReservedStock } from "../../src/lib/delivery-stock";

test("delivery accepts only an exact expected version",()=>{
  assert.deepEqual(deliverOrderSchema.parse({version:3}),{version:3});
  for(const body of [{},{version:0},{version:"3"},{version:1.5},{version:2147483647},
    {version:3,items:[]},{version:3,quantity:1},{version:3,status:"DELIVERED"},
    {version:3,deliveredByMembershipId:"client"}])assert.equal(deliverOrderSchema.safeParse(body).success,false);
});
test("consuming reservations leaves available stock unchanged and preserves other orders",()=>{
  assert.deepEqual(consumeReservedStock(10,7,3),{physicalQuantity:7,reservedQuantity:4,availableQuantity:3});
  assert.deepEqual(consumeReservedStock(3,3,3),{physicalQuantity:0,reservedQuantity:0,availableQuantity:0});
  assert.deepEqual(consumeReservedStock(2147483647,1000000,1000000),{physicalQuantity:2146483647,reservedQuantity:0,availableQuantity:2146483647});
});
test("inconsistent or malformed stock cannot be consumed",()=>{
  for(const [physical,reserved,quantity] of [[10,2,3],[2,3,1],[10,-1,1],[-1,0,1],
    [10,3,0],[10,3,1.5],[10,3,NaN],[2147483648,3,1],[10,0.5,1],[1000001,1000001,1000001]]){
    assert.throws(()=>consumeReservedStock(physical,reserved,quantity),RangeError);
  }
});
