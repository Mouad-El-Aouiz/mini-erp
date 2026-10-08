import { z } from "zod";
import { entityIdSchema } from "./common";

export const MAX_PHYSICAL_QUANTITY = 2_147_483_647;
export const adjustmentSchema = z.strictObject({
  requestId: entityIdSchema.transform((id) => id.toLowerCase()),
  quantityDelta: z.number().int("Quantity must be a whole number.")
    .min(-MAX_PHYSICAL_QUANTITY).max(MAX_PHYSICAL_QUANTITY)
    .refine((quantity) => quantity !== 0, "Quantity change cannot be zero."),
  reason: z.string().trim().min(1, "A reason is required.").max(500, "Reason must contain at most 500 characters."),
});
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
export const quantityChangeSchema = z.string().trim().regex(/^-?(0|[1-9][0-9]{0,9})$/, "Enter a nonzero whole number, such as 10 or -2.")
  .transform(Number).refine((n) => n !== 0 && Math.abs(n) <= MAX_PHYSICAL_QUANTITY, "Enter a nonzero quantity between -2147483647 and 2147483647.");

export function nextPhysicalQuantity(current: number, delta: number): number {
  if (!Number.isInteger(current) || current < 0 || current > MAX_PHYSICAL_QUANTITY ||
      !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_PHYSICAL_QUANTITY) {
    throw new RangeError("Invalid stock quantities.");
  }
  const next = current + delta;
  if (next < 0) throw new RangeError("Adjustment would make physical stock negative.");
  if (next > MAX_PHYSICAL_QUANTITY) throw new RangeError("Adjustment exceeds the supported stock limit.");
  return next;
}
