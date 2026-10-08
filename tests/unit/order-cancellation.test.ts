import { test } from "node:test";
import assert from "node:assert/strict";
import { cancelOrderSchema } from "../../src/lib/validation/order";
import { releaseReservedStock } from "../../src/lib/cancellation-stock";

test("cancellation requires a version and a normalized, bounded reason", () => {
  assert.deepEqual(cancelOrderSchema.parse({ version: 3, reason: "  Customer withdrew request  " }), { version: 3, reason: "Customer withdrew request" });
  assert.equal(cancelOrderSchema.safeParse({ version: 3, reason: "x".repeat(500) }).success, true);
  for (const input of [{}, { version: 0, reason: "Valid" }, { version: "3", reason: "Valid" },
    { version: 2147483647, reason: "Valid" }, { version: 3 }, { version: 3, reason: "  \n\t" },
    { version: 3, reason: "x".repeat(501) }, { version: 3, reason: "bad\u0000reason" },
    { version: 3, reason: "Valid", quantities: [] }, { version: 3, reason: "Valid", cancelledAt: "client" }]) {
    assert.equal(cancelOrderSchema.safeParse(input).success, false);
  }
});
test("release preserves physical stock and other reservations while increasing availability", () => {
  assert.deepEqual(releaseReservedStock(10, 7, 3), { physicalQuantity: 10, reservedQuantity: 4, availableQuantity: 6 });
  assert.deepEqual(releaseReservedStock(3, 3, 3), { physicalQuantity: 3, reservedQuantity: 0, availableQuantity: 3 });
  assert.deepEqual(releaseReservedStock(2147483647, 1000000, 1000000), { physicalQuantity: 2147483647, reservedQuantity: 0, availableQuantity: 2147483647 });
});
test("release rejects inconsistent stock and malformed quantities", () => {
  for (const [physical, reserved, quantity] of [[10, 2, 3], [2, 3, 1], [10, -1, 1], [-1, 0, 1],
    [10, 3, 0], [10, 3, 1.5], [10, 3, NaN], [2147483648, 3, 1], [10, 0.5, 1], [1000001, 1000001, 1000001]]) {
    assert.throws(() => releaseReservedStock(physical, reserved, quantity), RangeError);
  }
});
