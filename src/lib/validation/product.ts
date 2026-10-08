import { z } from "zod";

export const MAX_UNIT_PRICE_CENTS = 2_147_483_647;
export const productSchema = z.strictObject({
  sku: z.string().trim().min(1, "SKU is required.")
    .max(64, "SKU must contain at most 64 characters.")
    .regex(/^[A-Z0-9][A-Z0-9._-]*$/i, "Use letters, numbers, dots, hyphens or underscores; start with a letter or number.").transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1, "Product name is required.")
    .max(200, "Product name must contain at most 200 characters."),
  unitPriceCents: z.number().int("Price must be an integer number of cents.")
    .min(0, "Price cannot be negative.").max(MAX_UNIT_PRICE_CENTS, "Price exceeds the supported limit."),
});
export type ProductInput = z.infer<typeof productSchema>;

// Parse digits directly: decimal strings never pass through floating-point multiplication.
export const usdPriceSchema = z.string().trim()
  .regex(/^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$/, "Enter a USD amount with at most two decimal places, such as 129.99.")
  .transform((value) => {
    const [dollars, cents = ""] = value.split(".");
    return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  })
  .refine((cents) => cents <= MAX_UNIT_PRICE_CENTS, "Price must not exceed 21474836.47 USD.");

export function centsToUsdInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
