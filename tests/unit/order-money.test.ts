import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateDraftTotals, MAX_SUBTOTAL_CENTS } from "../../src/lib/order-money";
test("draft amounts use captured integer cents and round tax once",()=>{
  assert.deepEqual(calculateDraftTotals([{quantity:2,unitPriceCents:12999}],1000),{subtotalCents:25998,taxCents:2600,totalCents:28598,taxRateBps:1000});
  assert.equal(calculateDraftTotals([{quantity:1,unitPriceCents:5}],1000).taxCents,1);
  assert.equal(calculateDraftTotals([{quantity:1,unitPriceCents:4}],1000).taxCents,0);
  assert.equal(calculateDraftTotals([{quantity:1,unitPriceCents:5},{quantity:1,unitPriceCents:5}],1000).taxCents,1);
  assert.equal(calculateDraftTotals([],1000).totalCents,0);
});
test("maximum cents and tax rates remain exact and safe",()=>{
  assert.equal(calculateDraftTotals([{quantity:1,unitPriceCents:MAX_SUBTOTAL_CENTS}],10000).totalCents,MAX_SUBTOTAL_CENTS*2);
  assert.equal(calculateDraftTotals([{quantity:1,unitPriceCents:100}],0).taxCents,0);
  assert.equal(calculateDraftTotals([{quantity:1,unitPriceCents:10000}],1234).taxCents,1234);
});
test("invalid inputs and excessively large subtotals are rejected",()=>{
  for(const item of [{quantity:0,unitPriceCents:1},{quantity:1.5,unitPriceCents:1},{quantity:1,unitPriceCents:-1},{quantity:1000001,unitPriceCents:1},{quantity:1,unitPriceCents:NaN}]) assert.throws(()=>calculateDraftTotals([item],1000),RangeError);
  for(const rate of [-1,10001,0.5,NaN]) assert.throws(()=>calculateDraftTotals([],rate),RangeError);
  assert.throws(()=>calculateDraftTotals([{quantity:1000000,unitPriceCents:MAX_SUBTOTAL_CENTS}],1000),RangeError);
  assert.throws(()=>calculateDraftTotals(Array.from({length:101},()=>({quantity:1,unitPriceCents:0})),1000),RangeError);
});
