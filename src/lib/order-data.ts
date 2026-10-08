import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockActiveMembership, type TenantAccess } from "@/lib/membership-lock";
import { calculateDraftTotals } from "@/lib/order-money";
import type { CreateDraftInput, UpdateDraftInput, RefreshPricesInput, TaxSettingsInput, ConfirmOrderInput } from "@/lib/validation/order";
export class OrderNotFoundError extends Error { constructor() { super("Order not found."); } }
export class OrderConflictError extends Error {}
export class OrderReferenceError extends Error {}
const scope = (access: TenantAccess) => ({ tenantId: access.tenantId,
  tenant: { memberships: { some: { id: access.id, userId: access.userId, isActive: true } } } });
const itemSelect = { id:true, productId:true, quantity:true, unitPriceCents:true, productName:true, productSku:true,
  product:{select:{unitPriceCents:true}} } as const;
const orderSelect = { id:true, customerId:true, status:true, version:true, createdAt:true, updatedAt:true,
  createdByMembershipId:true, confirmedAt:true, confirmedByMembershipId:true,
  confirmedTaxVersion:true, acceptedTaxRateBps:true, subtotalCents:true, taxCents:true,
  totalCents:true, customerCompanyName:true } as const;
type OrderRow=Prisma.OrderGetPayload<{select:typeof orderSelect}>&{
  customer:{id:string;companyName:string};tenant:{taxRateBps:number;taxVersion:number};
  items:Prisma.OrderItemGetPayload<{select:typeof itemSelect}>[];
};
function orderRecord(row: OrderRow) {
  const { tenant, items, totalCents, ...order } = row;
  const confirmed=row.status!=="DRAFT";
  const totals=confirmed?{subtotalCents:row.subtotalCents!,taxCents:row.taxCents!,
    totalCents:Number(totalCents!),taxRateBps:row.acceptedTaxRateBps!}:calculateDraftTotals(items,tenant.taxRateBps);
  return { ...order, totalCents:totalCents===null?null:Number(totalCents),
    customer:confirmed?{...order.customer,companyName:row.customerCompanyName!}:order.customer, items:items.map(({product, ...item}) => ({...item,
    currentUnitPriceCents:product.unitPriceCents, priceChanged:item.unitPriceCents !== product.unitPriceCents,
    lineTotalCents:item.quantity * item.unitPriceCents })),
    totals, taxVersion:confirmed?row.confirmedTaxVersion!:tenant.taxVersion };
}
export type OrderRecord = Awaited<ReturnType<typeof getOrder>>;
export async function listOrders(access: TenantAccess, page: number) {
  const rows = await prisma.order.findMany({where:scope(access), select:{id:true,status:true,version:true,updatedAt:true,
    customerCompanyName:true, customer:{select:{companyName:true}},_count:{select:{items:true}}}, orderBy:[{updatedAt:"desc"},{id:"desc"}],skip:(page-1)*20,take:21});
  return {orders:rows.slice(0,20).map(({_count,...row})=>({...row,customer:{companyName:row.customerCompanyName??row.customer.companyName},itemCount:_count.items})),page,pageSize:20,hasNextPage:rows.length>20};
}
export async function getOrder(access: TenantAccess, orderId: string) {
  return prisma.$transaction(async tx=>{
    const row=await tx.order.findFirst({where:{...scope(access),id:orderId},select:orderSelect});
    if(!row) throw new OrderNotFoundError();
    // Sequential reads avoid concurrent queries on the transaction's single pg connection.
    const customer=await tx.customer.findUniqueOrThrow({where:{tenantId_id:{tenantId:access.tenantId,id:row.customerId}},select:{id:true,companyName:true}});
    const tenant=await tx.tenant.findUniqueOrThrow({where:{id:access.tenantId},select:{taxRateBps:true,taxVersion:true}});
    const items=await tx.orderItem.findMany({where:{tenantId:access.tenantId,orderId},select:itemSelect,orderBy:{productId:"asc"}});
    let delivery=null;
    if(row.status==="DELIVERED") {
      const record=await tx.delivery.findUniqueOrThrow({where:{tenantId_orderId:{tenantId:access.tenantId,orderId}},
        select:{id:true,orderId:true,deliveredAt:true,deliveredByMembershipId:true}});
      const actor=await tx.membership.findUniqueOrThrow({where:{tenantId_id:{tenantId:access.tenantId,id:record.deliveredByMembershipId}},select:{userId:true}});
      const user=await tx.user.findUniqueOrThrow({where:{id:actor.userId},select:{name:true}});
      delivery={...record,deliveredByName:user.name};
    }
    let cancellation=null;
    if(row.status==="CANCELLED") {
      const record=await tx.cancellation.findUniqueOrThrow({where:{tenantId_orderId:{tenantId:access.tenantId,orderId}},
        select:{id:true,orderId:true,cancelledAt:true,cancelledByMembershipId:true,reason:true}});
      const actor=await tx.membership.findUniqueOrThrow({where:{tenantId_id:{tenantId:access.tenantId,id:record.cancelledByMembershipId}},select:{userId:true}});
      const user=await tx.user.findUniqueOrThrow({where:{id:actor.userId},select:{name:true}});
      cancellation={...record,cancelledByName:user.name};
    }
    return {...orderRecord({...row,customer,tenant,items}),delivery,cancellation};
  },{isolationLevel:"RepeatableRead"});
}
async function customerExists(tx: Prisma.TransactionClient, tenantId:string, customerId:string) {
  if(!await tx.customer.findFirst({where:{tenantId,id:customerId},select:{id:true}})) throw new OrderReferenceError("Customer is unavailable in this company.");
}
export async function createDraft(access:TenantAccess,input:CreateDraftInput) {
  return prisma.$transaction(async tx=>{
    await lockActiveMembership(tx,access);
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`draft:${access.tenantId}:${input.requestId}`},0))`;
    const requestHash=createHash("sha256").update(input.customerId).digest("hex");
    const previous=await tx.order.findUnique({where:{tenantId_requestId:{tenantId:access.tenantId,requestId:input.requestId}},
      select:{id:true,requestHash:true,createdByMembershipId:true}});
    if(previous) {
      if(previous.requestHash!==requestHash || previous.createdByMembershipId!==access.id) throw new OrderConflictError("This request identifier was already used for another draft creation.");
      return {id:previous.id,replayed:true};
    }
    await customerExists(tx,access.tenantId,input.customerId);
    const order=await tx.order.create({data:{tenantId:access.tenantId,...input,requestHash,createdByMembershipId:access.id},select:{id:true}});
    return {...order,replayed:false};
  });
}
async function lockDraft(tx:Prisma.TransactionClient,access:TenantAccess,orderId:string,version:number) {
  await lockActiveMembership(tx,access);
  const rows=await tx.$queryRaw<{id:string;version:number;status:string}[]>`
    SELECT id,version,status FROM orders WHERE tenant_id=${access.tenantId}::uuid AND id=${orderId}::uuid FOR UPDATE`;
  if(rows.length===0) throw new OrderNotFoundError();
  if(rows[0].status!=="DRAFT") throw new OrderConflictError("Only draft orders can be edited.");
  if(rows[0].version!==version) throw new OrderConflictError("This draft has changed. Reload it before editing again.");
}
async function catalog(tx:Prisma.TransactionClient,tenantId:string,ids:string[]) {
  if(ids.length===0) return [];
  const rows=await tx.$queryRaw<{id:string;name:string;sku:string;unit_price_cents:number}[]>`
    SELECT id,name,sku,unit_price_cents FROM products WHERE tenant_id=${tenantId}::uuid
    AND id IN (${Prisma.join(ids.map(id=>Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`;
  if(rows.length!==ids.length) throw new OrderReferenceError("One or more products are unavailable in this company.");
  return rows;
}
function verifyTotals(items:{quantity:number;unitPriceCents:number}[]) {
  try { calculateDraftTotals(items,0); }
  catch(error) { if(error instanceof RangeError) throw new OrderConflictError(error.message); throw error; }
}
export async function updateDraft(access:TenantAccess,orderId:string,input:UpdateDraftInput) {
  return prisma.$transaction(async tx=>{
    await lockDraft(tx,access,orderId,input.version);
    await customerExists(tx,access.tenantId,input.customerId);
    const products=await catalog(tx,access.tenantId,input.items.map(item=>item.productId));
    const previous=await tx.orderItem.findMany({where:{tenantId:access.tenantId,orderId}});
    const oldByProduct=new Map(previous.map(item=>[item.productId,item]));
    const productById=new Map(products.map(product=>[product.id,product]));
    const items=input.items.map(item=>{
      const old=oldByProduct.get(item.productId),product=productById.get(item.productId)!;
      return {...item,unitPriceCents:old?.unitPriceCents??product.unit_price_cents,
        productName:old?.productName??product.name,productSku:old?.productSku??product.sku};
    });
    verifyTotals(items);
    await tx.orderItem.deleteMany({where:{tenantId:access.tenantId,orderId,productId:{notIn:items.map(item=>item.productId)}}});
    for(const item of items) await tx.orderItem.upsert({where:{tenantId_orderId_productId:{tenantId:access.tenantId,orderId,productId:item.productId}},
      create:{...item,tenantId:access.tenantId,orderId},update:{quantity:item.quantity}});
    await tx.order.update({where:{tenantId_id:{tenantId:access.tenantId,id:orderId}},data:{customerId:input.customerId,version:{increment:1}}});
    return {id:orderId,version:input.version+1};
  });
}
export async function refreshDraftPrices(access:TenantAccess,orderId:string,input:RefreshPricesInput) {
  return prisma.$transaction(async tx=>{
    await lockDraft(tx,access,orderId,input.version);
    const items=await tx.orderItem.findMany({where:{tenantId:access.tenantId,orderId}});
    const products=await catalog(tx,access.tenantId,items.map(item=>item.productId));
    const accepted=new Map(input.prices.map(price=>[price.productId,price.unitPriceCents]));
    if(input.prices.length!==items.length || products.some(product=>accepted.get(product.id)!==product.unit_price_cents)) {
      throw new OrderConflictError("Catalog prices have changed. Reload and review the current prices before accepting them.");
    }
    const productById=new Map(products.map(product=>[product.id,product]));
    verifyTotals(items.map(item=>({quantity:item.quantity,unitPriceCents:productById.get(item.productId)!.unit_price_cents})));
    for(const product of products) await tx.orderItem.update({where:{tenantId_orderId_productId:{tenantId:access.tenantId,orderId,productId:product.id}},data:{unitPriceCents:product.unit_price_cents}});
    await tx.order.update({where:{tenantId_id:{tenantId:access.tenantId,id:orderId}},data:{version:{increment:1}}});
    return {id:orderId,version:input.version+1};
  });
}
export async function getTaxSettings(access:TenantAccess) {
  const tenant=await prisma.tenant.findFirst({where:{id:access.tenantId,memberships:{some:{id:access.id,userId:access.userId,isActive:true}}},select:{taxRateBps:true,taxVersion:true}});
  if(!tenant) throw new OrderReferenceError("Company is unavailable.");
  return {taxRateBps:tenant.taxRateBps,version:tenant.taxVersion};
}
export async function updateTaxSettings(access:TenantAccess,input:TaxSettingsInput) {
  return prisma.$transaction(async tx=>{
    await lockActiveMembership(tx,access,"ADMIN");
    const rows=await tx.$queryRaw<{tax_version:number}[]>`SELECT tax_version FROM tenants WHERE id=${access.tenantId}::uuid FOR UPDATE`;
    if(rows[0].tax_version!==input.version) throw new OrderConflictError("Tax settings have changed. Reload before saving again.");
    const tenant=await tx.tenant.update({where:{id:access.tenantId},data:{taxRateBps:input.taxRateBps,taxVersion:{increment:1}},select:{taxRateBps:true,taxVersion:true}});
    return {taxRateBps:tenant.taxRateBps,version:tenant.taxVersion};
  });
}

export async function confirmOrder(access:TenantAccess, orderId:string, input:ConfirmOrderInput) {
  orderId=orderId.toLowerCase();
  return prisma.$transaction(async tx=>{
    await lockActiveMembership(tx,access);
    const orders=await tx.$queryRaw<{status:string;version:number;confirmed_by_membership_id:string|null;confirmed_tax_version:number|null}[]>`
      SELECT status,version,confirmed_by_membership_id,confirmed_tax_version FROM orders
      WHERE tenant_id=${access.tenantId}::uuid AND id=${orderId}::uuid FOR UPDATE`;
    if(orders.length===0) throw new OrderNotFoundError();
    const order=orders[0];
    if(order.status==="CONFIRMED") {
      if(order.version===input.version+1 && order.confirmed_by_membership_id===access.id && order.confirmed_tax_version===input.taxVersion) {
        return {id:orderId,status:"CONFIRMED" as const,version:order.version,replayed:true};
      }
      throw new OrderConflictError("This order is already confirmed. Reload it to view the accepted details.");
    }
    if(order.status!=="DRAFT" || order.version!==input.version) throw new OrderConflictError("This draft has changed. Reload it before confirming.");
    // Lock tax settings before products; retain exactly the rate reviewed by the user.
    const tenants=await tx.$queryRaw<{tax_rate_bps:number;tax_version:number}[]>`
      SELECT tax_rate_bps,tax_version FROM tenants WHERE id=${access.tenantId}::uuid FOR SHARE`;
    const tenant=tenants[0];
    if(tenant.tax_version!==input.taxVersion) throw new OrderConflictError("Tax settings have changed. Reload and review the totals before confirming.");
    const items=await tx.orderItem.findMany({where:{tenantId:access.tenantId,orderId},orderBy:{productId:"asc"}});
    if(items.length===0) throw new OrderConflictError("Add and save at least one product before confirming.");
    // Every stock writer locks product rows; sorted locks prevent opposite multi-product ordering.
    const products=await tx.$queryRaw<{id:string;unit_price_cents:number}[]>`
      SELECT id,unit_price_cents FROM products WHERE tenant_id=${access.tenantId}::uuid
      AND id IN (${Prisma.join(items.map(item=>Prisma.sql`${item.productId}::uuid`))}) ORDER BY id FOR UPDATE`;
    const prices=new Map(products.map(product=>[product.id,product.unit_price_cents]));
    if(items.some(item=>prices.get(item.productId)!==item.unitPriceCents)) {
      throw new OrderConflictError("Catalog prices have changed. Reload and explicitly accept current prices before confirming.");
    }
    const totals=calculateDraftTotals(items,tenant.tax_rate_bps);
    const saved=await tx.order.findUniqueOrThrow({where:{tenantId_id:{tenantId:access.tenantId,id:orderId}},select:{customerId:true}});
    const customers=await tx.$queryRaw<{company_name:string}[]>`
      SELECT company_name FROM customers WHERE tenant_id=${access.tenantId}::uuid AND id=${saved.customerId}::uuid FOR SHARE`;
    for(const item of items) {
      const key={tenantId:access.tenantId,productId:item.productId};
      const balance=await tx.inventoryBalance.upsert({where:{tenantId_productId:key},create:key,update:{}});
      if(balance.physicalQuantity-balance.reservedQuantity<item.quantity) {
        throw new OrderConflictError(`Insufficient available stock for ${item.productName}. Reload inventory before confirming.`);
      }
      await tx.inventoryBalance.update({where:{tenantId_productId:key},data:{reservedQuantity:{increment:item.quantity}}});
      await tx.stockReservation.create({data:{...key,orderId,quantity:item.quantity}});
    }
    await tx.order.update({where:{tenantId_id:{tenantId:access.tenantId,id:orderId}},data:{
      status:"CONFIRMED",version:{increment:1},confirmedAt:new Date(),confirmedByMembershipId:access.id,
      confirmedTaxVersion:tenant.tax_version,acceptedTaxRateBps:totals.taxRateBps,
      subtotalCents:totals.subtotalCents,taxCents:totals.taxCents,totalCents:BigInt(totals.totalCents),
      customerCompanyName:customers[0].company_name,
    }});
    return {id:orderId,status:"CONFIRMED" as const,version:input.version+1,replayed:false};
  },{timeout:15_000});
}
