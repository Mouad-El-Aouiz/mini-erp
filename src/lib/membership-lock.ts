import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { TenantAccessError, type requireTenantAccess } from "@/lib/tenant-access";

export type TenantAccess = Awaited<ReturnType<typeof requireTenantAccess>>;

export async function lockActiveMembership(transaction: Prisma.TransactionClient, access: TenantAccess, requiredRole?: "ADMIN") {
  // Hold a shared row lock until the write commits so concurrent revocation
  // cannot slip between the membership check and the business mutation.
  const memberships = await transaction.$queryRaw<{ id: string; role: string }[]>`
    SELECT id, role FROM memberships
    WHERE id = ${access.id}::uuid AND tenant_id = ${access.tenantId}::uuid
      AND user_id = ${access.userId} AND is_active = true
    FOR SHARE
  `;
  if (memberships.length === 0 || (requiredRole && memberships[0].role !== requiredRole)) throw new TenantAccessError("FORBIDDEN");
}
