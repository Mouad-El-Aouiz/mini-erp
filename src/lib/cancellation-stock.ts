const MAX_QUANTITY = 2_147_483_647;

export function releaseReservedStock(physical: number, reserved: number, quantity: number) {
  if (!Number.isInteger(physical) || physical < 0 || physical > MAX_QUANTITY ||
      !Number.isInteger(reserved) || reserved < 0 || reserved > physical ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000 || quantity > reserved) {
    throw new RangeError("Reserved stock is inconsistent. Reload inventory before cancelling.");
  }
  return {
    physicalQuantity: physical,
    reservedQuantity: reserved - quantity,
    availableQuantity: physical - reserved + quantity,
  };
}
