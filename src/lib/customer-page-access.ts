import "server-only";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { requireTenantAccess, TenantAccessError } from "@/lib/tenant-access";

export async function requireCustomerPageAccess(tenantId: string) {
  const access = await requireTenantAccess(tenantId).catch((error: unknown) => {
    if (error instanceof TenantAccessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      notFound();
    }
    throw error;
  });
  const tenant = await prisma.tenant.findFirst({
    where: { id: access.tenantId, memberships: { some: {
      id: access.id, userId: access.userId, isActive: true,
    } } },
    select: { name: true },
  });
  if (!tenant) notFound();
  return { ...access, tenantName: tenant.name };
}
