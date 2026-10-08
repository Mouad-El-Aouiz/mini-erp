export const MAX_SUBTOTAL_CENTS = 2_147_483_647;
export function calculateDraftTotals(items: readonly { quantity: number; unitPriceCents: number }[], taxRateBps: number) {
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000 || items.length > 100) throw new RangeError("Invalid draft pricing input.");
  let subtotal = BigInt(0);
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1_000_000 ||
        !Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0 || item.unitPriceCents > MAX_SUBTOTAL_CENTS) throw new RangeError("Invalid draft pricing input.");
    subtotal += BigInt(item.quantity) * BigInt(item.unitPriceCents);
  }
  if (subtotal > BigInt(MAX_SUBTOTAL_CENTS)) throw new RangeError("Draft subtotal exceeds 21474836.47 USD. Reduce quantities or remove lines.");
  // Round nonnegative tax once on the subtotal, half a cent rounds upward.
  const tax = (subtotal * BigInt(taxRateBps) + BigInt(5000)) / BigInt(10_000);
  return { subtotalCents: Number(subtotal), taxCents: Number(tax), totalCents: Number(subtotal + tax), taxRateBps };
}
