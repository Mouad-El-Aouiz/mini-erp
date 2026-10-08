import { z } from "zod";
import { entityIdSchema } from "./common";
const id = entityIdSchema.transform(value => value.toLowerCase());
export const orderQuantityTextSchema = z.string().regex(/^[1-9][0-9]{0,6}$/).transform(Number).refine(value => value <= 1_000_000);
export const versionSchema = z.number().int().min(1).max(2_147_483_646);
export const createDraftSchema = z.strictObject({ requestId: id, customerId: id });
const items = z.array(z.strictObject({ productId: id, quantity: z.number().int().min(1).max(1_000_000) })).max(100)
  .refine(rows => new Set(rows.map(row => row.productId)).size === rows.length, "Each product may appear only once.");
export const updateDraftSchema = z.strictObject({ version: versionSchema, customerId: id, items });
export const refreshPricesSchema = z.strictObject({ version: versionSchema,
  prices: z.array(z.strictObject({ productId: id, unitPriceCents: z.number().int().min(0).max(2_147_483_647) })).max(100)
    .refine(rows => new Set(rows.map(row => row.productId)).size === rows.length, "Each product may appear only once.") });
export const taxSettingsSchema = z.strictObject({ version: versionSchema, taxRateBps: z.number().int().min(0).max(10_000) });
export const taxPercentSchema = z.string().trim().regex(/^(0|[1-9][0-9]{0,2})(\.[0-9]{1,2})?$/, "Enter a percentage from 0 to 100 with at most two decimal places.")
  .transform(value => { const [whole, fraction = ""] = value.split("."); return Number(whole) * 100 + Number(fraction.padEnd(2, "0")); })
  .refine(bps => bps <= 10_000, "Tax must not exceed 100%.");
export type CreateDraftInput = z.infer<typeof createDraftSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type RefreshPricesInput = z.infer<typeof refreshPricesSchema>;
export type TaxSettingsInput = z.infer<typeof taxSettingsSchema>;

export const confirmOrderSchema = z.strictObject({ version: versionSchema, taxVersion: versionSchema });
export type ConfirmOrderInput = z.infer<typeof confirmOrderSchema>;
