import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantAccessError, type requireTenantAccess } from "@/lib/tenant-access";
import type { CustomerInput } from "@/lib/validation/customer";

export type CustomerAccess = Awaited<ReturnType<typeof requireTenantAccess>>;
export const CUSTOMER_PAGE_SIZE = 20;
export const customerSelect = {
  id: true, companyName: true, contactName: true, email: true,
  phone: true, address: true, createdAt: true, updatedAt: true,
} satisfies Prisma.CustomerSelect;

export class CustomerNotFoundError extends Error {
  constructor() { super("Customer not found."); }
}

function scope(access: CustomerAccess) {
  return {
    tenantId: access.tenantId,
    tenant: { memberships: { some: {
      id: access.id, userId: access.userId, isActive: true,
    } } },
  };
}

export async function listCustomers(access: CustomerAccess, page: number) {
  const rows = await prisma.customer.findMany({
    where: scope(access), select: customerSelect,
    orderBy: [{ companyName: "asc" }, { id: "asc" }],
    skip: (page - 1) * CUSTOMER_PAGE_SIZE, take: CUSTOMER_PAGE_SIZE + 1,
  });
  return { customers: rows.slice(0, CUSTOMER_PAGE_SIZE), page,
    pageSize: CUSTOMER_PAGE_SIZE, hasNextPage: rows.length > CUSTOMER_PAGE_SIZE };
}

export async function getCustomer(access: CustomerAccess, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { ...scope(access), id: customerId }, select: customerSelect,
  });
  if (!customer) throw new CustomerNotFoundError();
  return customer;
}

async function lockActiveMembership(transaction: Prisma.TransactionClient, access: CustomerAccess) {
  // Hold a shared row lock until the write commits so concurrent revocation
  // cannot slip between the membership check and the customer mutation.
  const memberships = await transaction.$queryRaw<{ id: string }[]>`
    SELECT id FROM memberships
    WHERE id = ${access.id}::uuid AND tenant_id = ${access.tenantId}::uuid
      AND user_id = ${access.userId} AND is_active = true
    FOR SHARE
  `;
  if (memberships.length === 0) throw new TenantAccessError("FORBIDDEN");
}

export async function createCustomer(access: CustomerAccess, input: CustomerInput) {
  return prisma.$transaction(async (transaction) => {
    await lockActiveMembership(transaction, access);
    return transaction.customer.create({
      data: { ...input, tenantId: access.tenantId }, select: customerSelect,
    });
  });
}

export async function replaceCustomer(access: CustomerAccess, customerId: string, input: CustomerInput) {
  return prisma.$transaction(async (transaction) => {
    await lockActiveMembership(transaction, access);
    const result = await transaction.customer.updateMany({
      where: { tenantId: access.tenantId, id: customerId }, data: input,
    });
    if (result.count !== 1) throw new CustomerNotFoundError();
    return transaction.customer.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: access.tenantId, id: customerId } },
      select: customerSelect,
    });
  });
}
