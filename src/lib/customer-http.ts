import "server-only";

import { z } from "zod";
import { CustomerNotFoundError } from "@/lib/customer-data";
import { TenantAccessError } from "@/lib/tenant-access";
import { customerSchema } from "@/lib/validation/customer";

export const privateHeaders = { "Cache-Control": "private, no-store" };

export class CustomerRequestError extends Error {
  constructor(public readonly status: number, message: string,
    public readonly fieldErrors?: Record<string, string[] | undefined>) {
    super(message);
  }
}

export function customerErrorResponse(error: unknown): Response {
  if (error instanceof TenantAccessError) {
    const errors = {
      UNAUTHENTICATED: [401, "Authentication required."],
      INVALID_TENANT_ID: [400, "Invalid tenant identifier."],
      FORBIDDEN: [403, "Access denied."],
    } as const;
    const [status, message] = errors[error.code];
    return Response.json({ error: message }, { status, headers: privateHeaders });
  }
  if (error instanceof CustomerNotFoundError) {
    return Response.json({ error: error.message }, { status: 404, headers: privateHeaders });
  }
  if (error instanceof CustomerRequestError) {
    return Response.json({ error: error.message, fieldErrors: error.fieldErrors },
      { status: error.status, headers: privateHeaders });
  }
  throw error;
}

export async function readCustomerInput(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new CustomerRequestError(415, "Content-Type must be application/json.");
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { throw new CustomerRequestError(400, "Invalid JSON body."); }
  const result = customerSchema.safeParse(body);
  if (!result.success) {
    throw new CustomerRequestError(422, "Invalid customer data.", z.flattenError(result.error).fieldErrors);
  }
  return result.data;
}
