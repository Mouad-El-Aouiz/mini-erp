import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockActiveMembership, type TenantAccess } from "@/lib/membership-lock";
import { OrderConflictError, OrderNotFoundError } from "@/lib/order-data";
import { releaseReservedStock } from "@/lib/cancellation-stock";
import type { CancelOrderInput } from "@/lib/validation/order";

const cancellationSelect = {
  id: true, orderId: true, cancelledAt: true, cancelledByMembershipId: true, reason: true,
} as const;

export async function cancelOrder(access: TenantAccess, orderId: string, input: CancelOrderInput) {
  orderId = orderId.toLowerCase();
  return prisma.$transaction(async tx => {
    // Recheck the current role inside the transaction, including exact retries.
    await lockActiveMembership(tx, access, "ADMIN");
    const rows = await tx.$queryRaw<{ status: string; version: number }[]>`
      SELECT status, version FROM orders
      WHERE tenant_id = ${access.tenantId}::uuid AND id = ${orderId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new OrderNotFoundError();
    const order = rows[0];
    const key = { tenantId: access.tenantId, orderId };
    if (order.status === "CANCELLED") {
      const cancellation = await tx.cancellation.findUniqueOrThrow({
        where: { tenantId_orderId: key }, select: cancellationSelect,
      });
      if (order.version === input.version + 1 && cancellation.cancelledByMembershipId === access.id &&
          cancellation.reason === input.reason) {
        return { order: { id: orderId, status: "CANCELLED" as const, version: order.version, replayed: true }, cancellation };
      }
      throw new OrderConflictError("This order is already cancelled. Reload it to view the recorded cancellation.");
    }
    if (order.status !== "CONFIRMED") throw new OrderConflictError("Only confirmed orders can be cancelled before delivery.");
    if (order.version !== input.version) throw new OrderConflictError("This order has changed. Reload it before cancelling.");
    const items = await tx.orderItem.findMany({
      where: key, orderBy: { productId: "asc" }, select: { productId: true, quantity: true },
    });
    if (items.length === 0 || items.length > 100) throw new OrderConflictError("Order lines are inconsistent. Cancellation was not recorded.");
    // Same ordered product locks as confirmation, delivery and manual adjustments.
    await tx.$queryRaw`SELECT id FROM products WHERE tenant_id = ${access.tenantId}::uuid
      AND id IN (${Prisma.join(items.map(item => Prisma.sql`${item.productId}::uuid`))}) ORDER BY id FOR UPDATE`;
    const reservations = await tx.stockReservation.findMany({ where: key });
    const byProduct = new Map(reservations.map(reservation => [reservation.productId, reservation]));
    if (reservations.length !== items.length || items.some(item => {
      const reservation = byProduct.get(item.productId);
      return !reservation || reservation.status !== "ACTIVE" || reservation.quantity !== item.quantity;
    })) throw new OrderConflictError("Order reservations are inconsistent. Cancellation was not recorded.");

    const cancelledAt = new Date();
    const cancellation = await tx.cancellation.create({
      data: { ...key, cancelledByMembershipId: access.id, cancelledAt, reason: input.reason }, select: cancellationSelect,
    });
    for (const item of items) {
      const productKey = { tenantId: access.tenantId, productId: item.productId };
      const balance = await tx.inventoryBalance.findUnique({ where: { tenantId_productId: productKey } });
      if (!balance) throw new OrderConflictError("Reserved stock is unavailable. Cancellation was not recorded.");
      let next;
      try {
        next = releaseReservedStock(balance.physicalQuantity, balance.reservedQuantity, item.quantity);
      } catch (error) {
        if (error instanceof RangeError) throw new OrderConflictError(error.message);
        throw error;
      }
      // Cancellation changes no physical units and creates no physical stock movement.
      await tx.inventoryBalance.update({
        where: { tenantId_productId: productKey }, data: { reservedQuantity: next.reservedQuantity },
      });
      await tx.stockReservation.update({
        where: { tenantId_orderId_productId: { ...productKey, orderId } },
        data: { status: "RELEASED", releasedAt: cancelledAt },
      });
    }
    await tx.order.update({
      where: { tenantId_id: { tenantId: access.tenantId, id: orderId } },
      data: { status: "CANCELLED", version: { increment: 1 } },
    });
    return { order: { id: orderId, status: "CANCELLED" as const, version: input.version + 1, replayed: false }, cancellation };
  }, { timeout: 15_000 });
}
