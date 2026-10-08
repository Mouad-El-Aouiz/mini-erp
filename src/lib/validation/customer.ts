import { z } from "zod";

function emptyToNull(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  return value;
}

function optionalText(maxLength: number, fieldName: string) {
  return z.preprocess(
    emptyToNull,
    z
      .string()
      .max(maxLength, `${fieldName} must contain at most ${maxLength} characters.`)
      .nullable(),
  );
}

export const customerSchema = z.strictObject({
  companyName: z
    .string()
    .trim()
    .min(1, "Company name is required.")
    .max(200, "Company name must contain at most 200 characters."),

  contactName: optionalText(150, "Contact name"),

  email: z.preprocess(
    emptyToNull,
    z
      .email("Enter a valid email address.")
      .max(254, "Email must contain at most 254 characters.")
      .nullable(),
  ),

  phone: optionalText(50, "Phone"),

  address: optionalText(1000, "Address"),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export const customerIdSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
);

export const customerPageSchema = z.string()
  .regex(/^[1-9][0-9]{0,3}$/)
  .default("1")
  .transform(Number);
