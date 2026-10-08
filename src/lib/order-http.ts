import "server-only";

import { z } from "zod";
import { OrderConflictError, OrderNotFoundError, OrderReferenceError } from "@/lib/order-data";
import { TenantAccessError } from "@/lib/tenant-access";

export const privateHeaders = { "Cache-Control": "private, no-store" };

export class OrderRequestError extends Error {
  constructor(public readonly status: number, message: string,
    public readonly fieldErrors?: Record<string, string[] | undefined>) {
    super(message);
  }
}

export function orderErrorResponse(error: unknown): Response {
  if (error instanceof TenantAccessError) {
    const errors = {
      UNAUTHENTICATED: [401, "Authentication required."],
      INVALID_TENANT_ID: [400, "Invalid tenant identifier."],
      FORBIDDEN: [403, "Access denied."],
    } as const;
    const [status, message] = errors[error.code];
    return Response.json({ error: message }, { status, headers: privateHeaders });
  }
  if (error instanceof OrderNotFoundError) {
    return Response.json({ error: error.message }, { status: 404, headers: privateHeaders });
  }
  if (error instanceof OrderRequestError) {
    return Response.json({ error: error.message, fieldErrors: error.fieldErrors },
      { status: error.status, headers: privateHeaders });
  }
  if (error instanceof OrderConflictError) {
    return Response.json({ error: error.message }, { status: 409, headers: privateHeaders });
  }
  if (error instanceof OrderReferenceError) return Response.json({error:error.message},{status:422,headers:privateHeaders});
  throw error;
}

export async function readOrderInput<T>(request: Request, schema: z.ZodType<T>) {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new OrderRequestError(415, "Content-Type must be application/json.");
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { throw new OrderRequestError(400, "Invalid JSON body."); }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new OrderRequestError(422, "Invalid request data.", z.flattenError(result.error).fieldErrors);
  }
  return result.data;
}
