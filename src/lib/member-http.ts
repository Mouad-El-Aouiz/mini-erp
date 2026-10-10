import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { MemberOperationError } from "@/lib/member-data";
import { TenantAccessError } from "@/lib/tenant-access";
export const memberHeaders = { "Cache-Control": "private, no-store" };
export class MemberRequestError extends MemberOperationError {
  constructor(status: number, message: string, public readonly fieldErrors?: Record<string, string[] | undefined>) {
    super(status, message);
  }
}
export function memberErrorResponse(error: unknown): Response {
  if (error instanceof TenantAccessError) {
    const statuses = { UNAUTHENTICATED: 401, INVALID_TENANT_ID: 400, FORBIDDEN: 403 };
    return Response.json({ error: error.code === "UNAUTHENTICATED" ? "Authentication required." : error.code === "FORBIDDEN" ? "Access denied." : "Invalid tenant identifier." },
      { status: statuses[error.code], headers: memberHeaders });
  }
  if (error instanceof MemberOperationError) {
    return Response.json({ error: error.message, ...(error instanceof MemberRequestError ? { fieldErrors: error.fieldErrors } : {}) },
      { status: error.status, headers: memberHeaders });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return Response.json({ error: "Unable to create this account. Use another email address." }, { status: 409, headers: memberHeaders });
  }
  throw error;
}
export async function readMemberInput<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new MemberRequestError(415, "Content-Type must be application/json.");
  let body: unknown;
  try { body = await request.json(); } catch { throw new MemberRequestError(400, "Invalid JSON body."); }
  const result = schema.safeParse(body);
  if (!result.success) throw new MemberRequestError(422, "Invalid member data.", z.flattenError(result.error).fieldErrors);
  return result.data;
}
