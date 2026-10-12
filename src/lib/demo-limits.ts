import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { TenantAccessError } from "@/lib/tenant-access";

export async function checkDemoCreation(tx: Prisma.TransactionClient, tenantId: string, kind: "customer" | "product" | "order" | "member" | "movement") {
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { demoExpiresAt: true } });
  if (!tenant.demoExpiresAt) return;
  if (kind === "member" || tenant.demoExpiresAt <= new Date()) throw new TenantAccessError("FORBIDDEN");
  // Serialize creation budgets within this demo only. Existing companies are unaffected.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`demo-budget:${tenantId}`}, 0))`;
  const count = kind === "customer" ? await tx.customer.count({ where: { tenantId } })
    : kind === "product" ? await tx.product.count({ where: { tenantId } }) : kind === "movement" ? await tx.stockMovement.count({ where: { tenantId, kind: "ADJUSTMENT" } }) : await tx.order.count({ where: { tenantId } });
  if (count >= (kind === "movement" ? 1000 : 100)) throw new TenantAccessError("FORBIDDEN");
}
