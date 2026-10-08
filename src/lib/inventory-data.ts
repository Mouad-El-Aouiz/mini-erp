import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockActiveMembership, type TenantAccess } from "@/lib/membership-lock";
import { ProductNotFoundError } from "@/lib/product-data";
import { nextPhysicalQuantity, type AdjustmentInput } from "@/lib/validation/inventory";

export class InventoryConflictError extends Error {}
const pageSize = 20;
const movementSelect = {
  id: true, productId: true, requestId: true, quantityDelta: true, reason: true,
  recordedByMembershipId: true, createdAt: true,
  recordedBy: { select: { user: { select: { name: true } } } },
} as const;
function movementRecord(row: Prisma.StockMovementGetPayload<{ select: typeof movementSelect }>) {
  const { recordedBy, ...record } = row;
  return { ...record, recordedByName: recordedBy.user.name };
}
const scope = (access: TenantAccess) => ({ tenantId: access.tenantId,
  tenant: { memberships: { some: { id: access.id, userId: access.userId, isActive: true } } } });

export async function listInventory(access: TenantAccess, page: number) {
  const rows = await prisma.product.findMany({ where: scope(access),
    select: { id: true, sku: true, name: true, inventoryBalance: { select: { physicalQuantity: true, reservedQuantity: true } } },
    orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize + 1 });
  return { inventory: rows.slice(0, pageSize).map(({ inventoryBalance, ...product }) =>
    ({ ...product, physicalQuantity: inventoryBalance?.physicalQuantity ?? 0, reservedQuantity: inventoryBalance?.reservedQuantity ?? 0,
      availableQuantity: (inventoryBalance?.physicalQuantity ?? 0)-(inventoryBalance?.reservedQuantity ?? 0) })),
    page, pageSize, hasNextPage: rows.length > pageSize };
}

export async function getInventoryHistory(access: TenantAccess, productId: string, page: number) {
  // Read quantity and history from one database snapshot during concurrent adjustments.
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { ...scope(access), id: productId },
      select: { id: true, sku: true, name: true } });
    if (!product) throw new ProductNotFoundError();
    const balance = await tx.inventoryBalance.findUnique({ where: {
      tenantId_productId: { tenantId: access.tenantId, productId },
    }, select: { physicalQuantity: true, reservedQuantity: true } });
    const rows = await tx.stockMovement.findMany({ where: {
      tenantId: access.tenantId, productId, product: scope(access),
    }, select: movementSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize, take: pageSize + 1 });
    return { product, physicalQuantity: balance?.physicalQuantity ?? 0, reservedQuantity: balance?.reservedQuantity ?? 0,
      availableQuantity: (balance?.physicalQuantity ?? 0)-(balance?.reservedQuantity ?? 0),
      movements: rows.slice(0, pageSize).map(movementRecord), page, pageSize, hasNextPage: rows.length > pageSize };
  }, { isolationLevel: "RepeatableRead" });
}

export async function adjustInventory(access: TenantAccess, productId: string, input: AdjustmentInput) {
  productId = productId.toLowerCase();
  return prisma.$transaction(async (tx) => {
    await lockActiveMembership(tx, access, "ADMIN");
    // Serialize one tenant/request pair, including retries targeting different products.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${access.tenantId}:${input.requestId}`}, 0))`;
    const previous = await tx.stockMovement.findUnique({
      where: { tenantId_requestId: { tenantId: access.tenantId, requestId: input.requestId } }, select: movementSelect });
    if (previous) {
      if (previous.productId !== productId || previous.quantityDelta !== input.quantityDelta ||
          previous.reason !== input.reason || previous.recordedByMembershipId !== access.id) {
        throw new InventoryConflictError("This request identifier was already used for a different adjustment.");
      }
      return { movement: movementRecord(previous), replayed: true };
    }
    // A row lock serializes all physical changes for this product. Membership is locked first.
    const products = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM products WHERE tenant_id = ${access.tenantId}::uuid AND id = ${productId}::uuid FOR UPDATE`;
    if (products.length === 0) throw new ProductNotFoundError();
    const key = { tenantId: access.tenantId, productId };
    const balance = await tx.inventoryBalance.upsert({ where: { tenantId_productId: key },
      create: { ...key, physicalQuantity: 0 }, update: {} });
    let quantity: number;
    try { quantity = nextPhysicalQuantity(balance.physicalQuantity, input.quantityDelta, balance.reservedQuantity); }
    catch (error) {
      if (error instanceof RangeError) throw new InventoryConflictError(error.message);
      throw error;
    }
    await tx.inventoryBalance.update({ where: { tenantId_productId: key }, data: { physicalQuantity: quantity } });
    const movement = await tx.stockMovement.create({ data: { ...key, ...input,
      recordedByMembershipId: access.id }, select: movementSelect });
    return { movement: movementRecord(movement), replayed: false };
  });
}
