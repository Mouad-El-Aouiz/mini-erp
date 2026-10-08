const MAX_QUANTITY = 2_147_483_647;

export function consumeReservedStock(physical:number, reserved:number, quantity:number) {
  if (!Number.isInteger(physical) || physical<0 || physical>MAX_QUANTITY ||
      !Number.isInteger(reserved) || reserved<0 || reserved>physical ||
      !Number.isInteger(quantity) || quantity<1 || quantity>1_000_000 || quantity>reserved) {
    throw new RangeError("Reserved stock is inconsistent. Reload inventory before delivering.");
  }
  return {physicalQuantity:physical-quantity, reservedQuantity:reserved-quantity,
    availableQuantity:physical-reserved};
}
