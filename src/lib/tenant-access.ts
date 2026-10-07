import "server-only";

import { headers } from "next/headers";
import type { MembershipRole } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AccessErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_TENANT_ID"
  | "FORBIDDEN";

export class TenantAccessError extends Error {
  constructor(public readonly code: AccessErrorCode) {
    super(code);
    this.name = "TenantAccessError";
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireTenantAccess(
  tenantId: string,
  requiredRole?: MembershipRole,
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new TenantAccessError("UNAUTHENTICATED");
  }

  if (!UUID_PATTERN.test(tenantId)) {
    throw new TenantAccessError("INVALID_TENANT_ID");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId: session.user.id,
      },
    },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      role: true,
      isActive: true,
    },
  });

  if (!membership || !membership.isActive) {
    throw new TenantAccessError("FORBIDDEN");
  }

  if (requiredRole && membership.role !== requiredRole) {
    throw new TenantAccessError("FORBIDDEN");
  }

  return membership;
}