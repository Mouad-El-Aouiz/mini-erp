import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { requireTenantAccess } from "@/lib/tenant-access";
import { lockActiveMembership } from "@/lib/membership-lock";
import type { ProductInput } from "@/lib/validation/product";

export type ProductAccess = Awaited<ReturnType<typeof requireTenantAccess>>;
export const PRODUCT_PAGE_SIZE = 20;
export const productSelect = {
  id: true, sku: true, name: true, unitPriceCents: true,
  createdAt: true, updatedAt: true,
} satisfies Prisma.ProductSelect;

export class ProductNotFoundError extends Error {
  constructor() { super("Product not found."); }
}

function scope(access: ProductAccess) {
  return {
    tenantId: access.tenantId,
    tenant: { memberships: { some: {
      id: access.id, userId: access.userId, isActive: true,
    } } },
  };
}

export async function listProducts(access: ProductAccess, page: number) {
  const rows = await prisma.product.findMany({
    where: scope(access), select: productSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * PRODUCT_PAGE_SIZE, take: PRODUCT_PAGE_SIZE + 1,
  });
  return { products: rows.slice(0, PRODUCT_PAGE_SIZE), page,
    pageSize: PRODUCT_PAGE_SIZE, hasNextPage: rows.length > PRODUCT_PAGE_SIZE };
}

export async function getProduct(access: ProductAccess, productId: string) {
  const product = await prisma.product.findFirst({
    where: { ...scope(access), id: productId }, select: productSelect,
  });
  if (!product) throw new ProductNotFoundError();
  return product;
}

export async function createProduct(access: ProductAccess, input: ProductInput) {
  return prisma.$transaction(async (transaction) => {
    await lockActiveMembership(transaction, access, "ADMIN");
    return transaction.product.create({
      data: { ...input, tenantId: access.tenantId }, select: productSelect,
    });
  });
}

export async function replaceProduct(access: ProductAccess, productId: string, input: ProductInput) {
  return prisma.$transaction(async (transaction) => {
    await lockActiveMembership(transaction, access, "ADMIN");
    const result = await transaction.product.updateMany({
      where: { tenantId: access.tenantId, id: productId }, data: input,
    });
    if (result.count !== 1) throw new ProductNotFoundError();
    return transaction.product.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: access.tenantId, id: productId } },
      select: productSelect,
    });
  });
}
