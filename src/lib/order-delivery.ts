import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockActiveMembership, type TenantAccess } from "@/lib/membership-lock";
import { OrderConflictError, OrderNotFoundError } from "@/lib/order-data";
import { consumeReservedStock } from "@/lib/delivery-stock";
import type { DeliverOrderInput } from "@/lib/validation/order";

const deliverySelect={id:true,orderId:true,deliveredAt:true,deliveredByMembershipId:true} as const;

export async function deliverOrder(access:TenantAccess, orderId:string, input:DeliverOrderInput) {
  orderId=orderId.toLowerCase();
  return prisma.$transaction(async tx=>{
    await lockActiveMembership(tx,access);
    const rows=await tx.$queryRaw<{status:string;version:number}[]>`
      SELECT status,version FROM orders WHERE tenant_id=${access.tenantId}::uuid
      AND id=${orderId}::uuid FOR UPDATE`;
    if(rows.length===0) throw new OrderNotFoundError();
    const order=rows[0],orderKey={tenantId:access.tenantId,id:orderId};
    if(order.status==="DELIVERED") {
      const delivery=await tx.delivery.findUniqueOrThrow({where:{tenantId_orderId:{tenantId:access.tenantId,orderId}},select:deliverySelect});
      if(order.version===input.version+1 && delivery.deliveredByMembershipId===access.id) {
        return {order:{id:orderId,status:"DELIVERED" as const,version:order.version,replayed:true},delivery};
      }
      throw new OrderConflictError("This order is already delivered. Reload it to view the recorded delivery.");
    }
    if(order.status!=="CONFIRMED") throw new OrderConflictError("Only confirmed orders can be delivered.");
    if(order.version!==input.version) throw new OrderConflictError("This order has changed. Reload it before recording delivery.");
    const items=await tx.orderItem.findMany({where:{tenantId:access.tenantId,orderId},orderBy:{productId:"asc"},select:{productId:true,quantity:true}});
    if(items.length===0 || items.length>100) throw new OrderConflictError("Order lines are inconsistent. Delivery was not recorded.");
    // Follow the shared stock-writer protocol, including a stable order for all products.
    await tx.$queryRaw`SELECT id FROM products WHERE tenant_id=${access.tenantId}::uuid
      AND id IN (${Prisma.join(items.map(item=>Prisma.sql`${item.productId}::uuid`))}) ORDER BY id FOR UPDATE`;
    const reservations=await tx.stockReservation.findMany({where:{tenantId:access.tenantId,orderId}});
    const byProduct=new Map(reservations.map(reservation=>[reservation.productId,reservation]));
    if(reservations.length!==items.length || items.some(item=>{
      const reservation=byProduct.get(item.productId);
      return !reservation || reservation.status!=="ACTIVE" || reservation.quantity!==item.quantity;
    })) throw new OrderConflictError("Order reservations are inconsistent. Delivery was not recorded.");
    const deliveredAt=new Date();
    const delivery=await tx.delivery.create({data:{tenantId:access.tenantId,orderId,deliveredByMembershipId:access.id,deliveredAt},select:deliverySelect});
    for(const item of items) {
      const key={tenantId:access.tenantId,productId:item.productId};
      const balance=await tx.inventoryBalance.findUnique({where:{tenantId_productId:key}});
      if(!balance) throw new OrderConflictError("Reserved stock is unavailable. Delivery was not recorded.");
      let next;
      try {next=consumeReservedStock(balance.physicalQuantity,balance.reservedQuantity,item.quantity);}
      catch(error){if(error instanceof RangeError)throw new OrderConflictError(error.message);throw error;}
      await tx.inventoryBalance.update({where:{tenantId_productId:key},data:{physicalQuantity:next.physicalQuantity,reservedQuantity:next.reservedQuantity}});
      await tx.stockReservation.update({where:{tenantId_orderId_productId:{...key,orderId}},data:{status:"CONSUMED",consumedAt:deliveredAt}});
      await tx.stockMovement.create({data:{...key,orderId,requestId:randomUUID(),kind:"DELIVERY",quantityDelta:-item.quantity,
        reason:"Complete order delivery",recordedByMembershipId:access.id,createdAt:deliveredAt}});
    }
    // Keep every accepted financial field unchanged.
    await tx.order.update({where:{tenantId_id:orderKey},data:{status:"DELIVERED",version:{increment:1}}});
    return {order:{id:orderId,status:"DELIVERED" as const,version:input.version+1,replayed:false},delivery};
  },{timeout:15_000});
}
