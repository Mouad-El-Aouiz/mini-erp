import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { PrismaClient } from "../src/generated/prisma/client";

export class StagingSetupError extends Error {}
export type StagingAdminConfig = {
  email: string; name: string; password: string; tenantId: string; tenantName: string;
};

export function validateStagingTarget(env: Readonly<Record<string, string | undefined>>): string {
  if (env.STAGING_SETUP_CONFIRM !== "mini-erp-staging") {
    throw new StagingSetupError("STAGING_SETUP_CONFIRM must equal mini-erp-staging.");
  }
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) ||
        url.hostname !== env.STAGING_DATABASE_HOST ||
        !url.hostname.endsWith(".neon.tech") || url.hostname.includes("-pooler.") ||
        url.pathname !== "/mini_erp_staging" || !url.username || !url.password ||
        !["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")) {
      throw new Error("invalid target");
    }
    return url.toString();
  } catch {
    throw new StagingSetupError("Use the confirmed direct Neon host, mini_erp_staging database and an SSL connection.");
  }
}

export function readStagingAdminConfig(env: Readonly<Record<string, string | undefined>>): StagingAdminConfig {
  const email = env.STAGING_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const name = env.STAGING_ADMIN_NAME?.trim() ?? "";
  const password = env.STAGING_ADMIN_PASSWORD ?? "";
  const tenantId = env.STAGING_TENANT_ID?.trim().toLowerCase() ?? "";
  const tenantName = env.STAGING_TENANT_NAME?.trim() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      !name || name.length > 200 || !tenantName || tenantName.length > 200 ||
      password.length < 12 || password.length > 128 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(tenantId)) {
    throw new StagingSetupError("Staging administrator configuration is invalid or incomplete.");
  }
  return { email, name, password, tenantId, tenantName };
}

export async function provisionStagingAdmin(prisma: PrismaClient, config: StagingAdminConfig) {
  const passwordHash = await hashPassword(config.password);
  return prisma.$transaction(async (tx) => {
    // Serialize this bootstrap procedure; never reset credentials or promote an existing user.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(781909220)`;
    const user = await tx.user.findUnique({ where: { email: config.email },
      include: { accounts: { where: { providerId: "credential", password: { not: null } } } } });
    const tenant = await tx.tenant.findUnique({ where: { id: config.tenantId } });
    if (user || tenant) {
      const membership = user && tenant ? await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      }) : null;
      if (!user || !tenant || user.accounts.length === 0 || !membership ||
          membership.role !== "ADMIN" || !membership.isActive) {
        throw new StagingSetupError("Existing records do not match an active staging administrator. No access or credentials changed.");
      }
      return "existing" as const;
    }
    if (await tx.user.count() || await tx.tenant.count()) {
      throw new StagingSetupError("Initial staging bootstrap requires a database without users or companies.");
    }
    const userId = randomUUID();
    await tx.user.create({ data: { id: userId, email: config.email, name: config.name,
      emailVerified: false, accounts: { create: { id: randomUUID(), accountId: userId,
        providerId: "credential", password: passwordHash } } } });
    await tx.tenant.create({ data: { id: config.tenantId, name: config.tenantName,
      memberships: { create: { userId, role: "ADMIN", isActive: true } } } });
    return "created" as const;
  });
}
