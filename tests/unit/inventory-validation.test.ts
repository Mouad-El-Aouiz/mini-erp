import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustmentSchema, quantityChangeSchema, nextPhysicalQuantity, MAX_PHYSICAL_QUANTITY } from "../../src/lib/validation/inventory";
const valid = { requestId: "A1B2C3D4-1234-4321-ABCD-123456789ABC", quantityDelta: 10, reason: " Receipt " };
test("adjustments normalize reason and request identifiers", () => {
  assert.deepEqual(adjustmentSchema.parse(valid), { ...valid, requestId: valid.requestId.toLowerCase(), reason: "Receipt" });
  for (const quantityDelta of [-MAX_PHYSICAL_QUANTITY, -1, 1, MAX_PHYSICAL_QUANTITY]) assert.equal(adjustmentSchema.safeParse({ ...valid, quantityDelta }).success, true);
});
test("invalid deltas, reasons and server-owned fields are rejected", () => {
  for (const change of [{ quantityDelta: 0 }, { quantityDelta: 1.5 }, { quantityDelta: "10" }, { quantityDelta: NaN },
    { quantityDelta: MAX_PHYSICAL_QUANTITY + 1 }, { reason: " " }, { reason: "X".repeat(501) },
    { requestId: "invalid" }, { tenantId: "untrusted" }, { recordedByMembershipId: "untrusted" }]) {
    assert.equal(adjustmentSchema.safeParse({ ...valid, ...change }).success, false);
  }
});
test("quantity strings accept signed integer units without silent rounding", () => {
  for (const [text, expected] of [["10", 10], [" -2 ", -2], ["2147483647", MAX_PHYSICAL_QUANTITY]] as const) assert.equal(quantityChangeSchema.parse(text), expected);
  for (const text of ["0", "-0", "1.5", "1e3", "+2", "01", "", "2147483648"]) assert.equal(quantityChangeSchema.safeParse(text).success, false);
});
test("stock arithmetic rejects underflow and overflow", () => {
  assert.equal(nextPhysicalQuantity(10, -10), 0);
  assert.equal(nextPhysicalQuantity(10, 2), 12);
  assert.equal(nextPhysicalQuantity(0, MAX_PHYSICAL_QUANTITY), MAX_PHYSICAL_QUANTITY);
  for (const [current, delta] of [[0, -1], [MAX_PHYSICAL_QUANTITY, 1], [-1, 1], [1, 0], [1, 1.5], [NaN, 1]]) assert.throws(() => nextPhysicalQuantity(current, delta), RangeError);
});
