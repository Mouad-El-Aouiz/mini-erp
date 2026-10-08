import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockActiveMembership, type TenantAccess } from "@/lib/membership-lock";
import { calculateDraftTotals } from "@/lib/order-money";
import type { CreateDraftInput, UpdateDraftInput, RefreshPricesInput, TaxSettingsInput } from "@/lib/validation/order";
export class OrderNotFoundError extends Error { constructor() { super("Order not found."); } }
export class OrderConflictError extends Error {}
export class OrderReferenceError extends Error {}
const scope = (access: TenantAccess) => ({ tenantId: access.tenantId,
  tenant: { memberships: { some: { id: access.id, userId: access.userId, isActive: true } } } });
const itemSelect = { id:true, productId:true, quantity:true, unitPriceCents:true, productName:true, productSku:true,
  product:{select:{unitPriceCents:true}} } as const;
const orderSelect = { id:true, customerId:true, status:true, version:true, createdAt:true, updatedAt:true,
  createdByMembershipId:true } as const;
type DraftRow=Prisma.OrderGetPayload<{select:typeof orderSelect}>&{
  customer:{id:string;companyName:string};tenant:{taxRateBps:number;taxVersion:number};
  items:Prisma.OrderItemGetPayload<{select:typeof itemSelect}>[];
};
function draftRecord(row: DraftRow) {
  const { tenant, items, ...order } = row;
  return { ...order, items:items.map(({product, ...item}) => ({...item,
    currentUnitPriceCents:product.unitPriceCents, priceChanged:item.unitPriceCents !== product.unitPriceCents,
    lineTotalCents:item.quantity * item.unitPriceCents })),
    totals:calculateDraftTotals(items, tenant.taxRateBps), taxVersion:tenant.taxVersion };
}
export type DraftRecord = ReturnType<typeof draftRecord>;
export async function listOrders(access: TenantAccess, page: number) {
  const rows = await prisma.order.findMany({where:scope(access), select:{id:true,status:true,version:true,updatedAt:true,
    customer:{select:{companyName:true}},_count:{select:{items:true}}}, orderBy:[{updatedAt:"desc"},{id:"desc"}],skip:(page-1)*20,take:21});
  return {orders:rows.slice(0,20).map(({_count,...row})=>({...row,itemCount:_count.items})),page,pageSize:20,hasNextPage:rows.length>20};
}
export async function getDraft(access: TenantAccess, orderId: string) {
  return prisma.$transaction(async tx=>{
    const row=await tx.order.findFirst({where:{...scope(access),id:orderId},select:orderSelect});
    if(!row) throw new OrderNotFoundError();
    // Sequential reads avoid concurrent queries on the transaction's single pg connection.
    const customer=await tx.customer.findUniqueOrThrow({where:{tenantId_id:{tenantId:access.tenantId,id:row.customerId}},select:{id:true,companyName:true}});
    const tenant=await tx.tenant.findUniqueOrThrow({where:{id:access.tenantId},select:{taxRateBps:true,taxVersion:true}});
    const items=await tx.orderItem.findMany({where:{tenantId:access.tenantId,orderId},select:itemSelect,orderBy:{productId:"asc"}});
    return draftRecord({...row,customer,tenant,items});
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
