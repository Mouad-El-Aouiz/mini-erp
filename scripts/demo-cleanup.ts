import type { PrismaClient } from "../src/generated/prisma/client";

export async function cleanupExpiredDemos(database: PrismaClient) {
  const candidates = await database.tenant.findMany({ where: { demoOwnerId: { not: null }, demoExpiresAt: { lte: new Date() } },
    select: { id: true }, take: 100, orderBy: { demoExpiresAt: "asc" } });
  let removed = 0;
  for (const candidate of candidates) {
    const deleted = await database.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(781909221)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.id}, 42001))`;
      // Match the actor-before-business lock order. Wait for authorized writes to finish.
      await tx.$queryRaw`SELECT id FROM memberships WHERE tenant_id = ${candidate.id}::uuid ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${candidate.id}::uuid FOR UPDATE`;
      const tenant = await tx.tenant.findUnique({ where: { id: candidate.id } });
      if (!tenant?.demoOwnerId || !tenant.demoExpiresAt || tenant.demoExpiresAt > new Date()) return false;
      // Never delete an identity with access elsewhere or a company with extra members.
      const memberships = await tx.membership.findMany({ where: { tenantId: tenant.id }, select: { userId: true } });
      if (memberships.length !== 1 || memberships[0].userId !== tenant.demoOwnerId ||
          await tx.membership.count({ where: { userId: tenant.demoOwnerId, tenantId: { not: tenant.id } } })) return false;
      const where = { tenantId: tenant.id };
      await tx.stockMovement.deleteMany({ where });
      await tx.stockReservation.deleteMany({ where });
      await tx.cancellation.deleteMany({ where });
      await tx.delivery.deleteMany({ where });
      await tx.orderItem.deleteMany({ where });
      await tx.order.deleteMany({ where });
      await tx.inventoryBalance.deleteMany({ where });
      await tx.product.deleteMany({ where });
      await tx.customer.deleteMany({ where });
      await tx.membership.deleteMany({ where });
      await tx.tenant.delete({ where: { id: tenant.id } });
      await tx.user.delete({ where: { id: tenant.demoOwnerId } });
      return true;
    }, { timeout: 15000 });
    if (deleted) removed++;
  }
  await database.demoSignupAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400000) } } });
  return removed;
}
