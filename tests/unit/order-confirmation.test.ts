import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmOrderSchema } from "../../src/lib/validation/order";
import { nextPhysicalQuantity } from "../../src/lib/validation/inventory";

test("confirmation requires exact reviewed versions and rejects client snapshots",()=>{
  assert.deepEqual(confirmOrderSchema.parse({version:2,taxVersion:3}),{version:2,taxVersion:3});
  for(const body of [{version:1},{version:0,taxVersion:1},{version:1,taxVersion:"1"},{version:1,taxVersion:0},
    {version:1,taxVersion:1,totalCents:0},{version:1,taxVersion:1,status:"CONFIRMED"},
    {version:2147483647,taxVersion:1}]) assert.equal(confirmOrderSchema.safeParse(body).success,false);
});
test("physical corrections cannot consume quantities already reserved",()=>{
  assert.equal(nextPhysicalQuantity(10,-7,3),3);
  assert.equal(nextPhysicalQuantity(10,2,3),12);
  assert.throws(()=>nextPhysicalQuantity(10,-8,3),/below reserved/);
  for(const reserved of [-1,11,0.5,NaN]) assert.throws(()=>nextPhysicalQuantity(10,1,reserved),RangeError);
});
