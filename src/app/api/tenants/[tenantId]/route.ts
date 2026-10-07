import { prisma } from "@/lib/prisma";
import {
  requireTenantAccess,
  TenantAccessError,
} from "@/lib/tenant-access";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;
    const membership = await requireTenantAccess(tenantId);

    const tenant = await prisma.tenant.findUnique({
      where: { id: membership.tenantId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!tenant) {
      return Response.json(
        { error: "Tenant not found." },
        { status: 404, headers: PRIVATE_HEADERS },
      );
    }

    return Response.json(
      {
        tenant,
        membership: {
          id: membership.id,
          role: membership.role,
        },
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    if (error instanceof TenantAccessError) {
      const responses = {
        UNAUTHENTICATED: {
          status: 401,
          message: "Authentication required.",
        },
        INVALID_TENANT_ID: {
          status: 400,
          message: "Invalid tenant identifier.",
        },
        FORBIDDEN: {
          status: 403,
          message: "Access denied.",
        },
      };

      const response = responses[error.code];

      return Response.json(
        { error: response.message },
        { status: response.status, headers: PRIVATE_HEADERS },
      );
    }

    throw error;
  }
}