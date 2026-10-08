import { test } from "node:test";
import assert from "node:assert/strict";
import { productSchema, usdPriceSchema, centsToUsdInput, formatUsd, MAX_UNIT_PRICE_CENTS } from "../../src/lib/validation/product";

const valid = { sku: " laptop-01 ", name: " Business laptop ", unitPriceCents: 12999 };
test("product input normalizes ASCII SKUs and trims names", () => {
  assert.deepEqual(productSchema.parse(valid), { sku: "LAPTOP-01", name: "Business laptop", unitPriceCents: 12999 });
  for (const sku of ["", " ", "-ABC", "A B", "é", "A/1", "A".repeat(65)]) {
    assert.equal(productSchema.safeParse({ ...valid, sku }).success, false);
  }
  assert.equal(productSchema.safeParse({ ...valid, sku: "A._-9", name: "A".repeat(200) }).success, true);
});
test("product input rejects untrusted fields, invalid names and non-integer prices", () => {
  for (const change of [{ name: " " }, { name: "X".repeat(201) }, { unitPriceCents: -1 },
    { unitPriceCents: 1.5 }, { unitPriceCents: "100" }, { unitPriceCents: null },
    { unitPriceCents: Infinity }, { unitPriceCents: MAX_UNIT_PRICE_CENTS + 1 }, { tenantId: "client-selected" }]) {
    assert.equal(productSchema.safeParse({ ...valid, ...change }).success, false);
  }
  for (const unitPriceCents of [0, MAX_UNIT_PRICE_CENTS]) {
    assert.equal(productSchema.safeParse({ ...valid, unitPriceCents }).success, true);
  }
});
test("USD decimal strings convert to exact cents without silent rounding", () => {
  for (const [input, cents] of [["0", 0], ["0.01", 1], ["0.1", 10], ["1.10", 110],
    ["129.99", 12999], [" 12.34 ", 1234], ["21474836.47", MAX_UNIT_PRICE_CENTS]] as const) {
    assert.equal(usdPriceSchema.parse(input), cents);
    assert.equal(usdPriceSchema.parse(centsToUsdInput(cents)), cents);
  }
  for (const input of ["", "-1", "1.001", "1,50", ".5", "1.", "01", "1e3", "NaN", "21474836.48", "999999999"]) {
    assert.equal(usdPriceSchema.safeParse(input).success, false, input);
  }
  assert.equal(formatUsd(12999), "$129.99");
});
