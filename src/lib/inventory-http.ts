import "server-only";

import { z } from "zod";
import { InventoryConflictError } from "@/lib/inventory-data";
import { ProductNotFoundError } from "@/lib/product-data";
import { TenantAccessError } from "@/lib/tenant-access";
import { adjustmentSchema } from "@/lib/validation/inventory";

export const privateHeaders = { "Cache-Control": "private, no-store" };

export class InventoryRequestError extends Error {
  constructor(public readonly status: number, message: string,
    public readonly fieldErrors?: Record<string, string[] | undefined>) {
    super(message);
  }
}

export function inventoryErrorResponse(error: unknown): Response {
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
  if (error instanceof InventoryRequestError) {
    return Response.json({ error: error.message, fieldErrors: error.fieldErrors },
      { status: error.status, headers: privateHeaders });
  }
  if (error instanceof InventoryConflictError) {
    return Response.json({ error: error.message }, { status: 409, headers: privateHeaders });
  }
  throw error;
}

export async function readAdjustmentInput(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new InventoryRequestError(415, "Content-Type must be application/json.");
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { throw new InventoryRequestError(400, "Invalid JSON body."); }
  const result = adjustmentSchema.safeParse(body);
  if (!result.success) {
    throw new InventoryRequestError(422, "Invalid adjustment data.", z.flattenError(result.error).fieldErrors);
  }
  return result.data;
}
