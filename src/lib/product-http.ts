import "server-only";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ProductNotFoundError } from "@/lib/product-data";
import { TenantAccessError } from "@/lib/tenant-access";
import { productSchema } from "@/lib/validation/product";

export const privateHeaders = { "Cache-Control": "private, no-store" };

export class ProductRequestError extends Error {
  constructor(public readonly status: number, message: string,
    public readonly fieldErrors?: Record<string, string[] | undefined>) {
    super(message);
  }
}

export function productErrorResponse(error: unknown): Response {
  if (error instanceof TenantAccessError) {
    const errors = {
      UNAUTHENTICATED: [401, "Authentication required."],
      INVALID_TENANT_ID: [400, "Invalid tenant identifier."],
      FORBIDDEN: [403, "Access denied."],
    } as const;
    const [status, message] = errors[error.code];
    return Response.json({ error: message }, { status, headers: privateHeaders });
  }
  if (error instanceof ProductNotFoundError) {
    return Response.json({ error: error.message }, { status: 404, headers: privateHeaders });
  }
  if (error instanceof ProductRequestError) {
    return Response.json({ error: error.message, fieldErrors: error.fieldErrors },
      { status: error.status, headers: privateHeaders });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return Response.json({ error: "This SKU is already used by a product in this company.",
      fieldErrors: { sku: ["Choose a different SKU."] } }, { status: 409, headers: privateHeaders });
  }
  throw error;
}

export async function readProductInput(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ProductRequestError(415, "Content-Type must be application/json.");
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { throw new ProductRequestError(400, "Invalid JSON body."); }
  const result = productSchema.safeParse(body);
  if (!result.success) {
    throw new ProductRequestError(422, "Invalid product data.", z.flattenError(result.error).fieldErrors);
  }
  return result.data;
}
