import "dotenv/config";

import { prisma } from "../src/lib/prisma";

const DEFAULT_TENANT_ID = "7e1df07a-5b96-4c66-9d27-6471c55b7020";
const DEFAULT_TENANT_NAME = "Demo IT Supplies";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class SetupError extends Error {}

async function main() {
  try {
    const databaseURL = process.env.DATABASE_URL;
    if (!databaseURL) throw new SetupError("DATABASE_URL is required.");
    const database = new URL(databaseURL);
    if (
      process.env.NODE_ENV === "production" ||
      !["postgresql:", "postgres:"].includes(database.protocol) ||
      !["localhost", "127.0.0.1"].includes(database.hostname) ||
      database.pathname !== "/mini_erp"
    ) {
      throw new SetupError("This script requires the local mini_erp development database.");
    }

    const email = process.env.DEV_USER_EMAIL?.trim().toLowerCase();
    const tenantId = (process.env.DEV_TENANT_ID ?? DEFAULT_TENANT_ID).trim().toLowerCase();
    const name = (process.env.DEV_TENANT_NAME ?? DEFAULT_TENANT_NAME).trim();
    if (!email) throw new SetupError("DEV_USER_EMAIL is required.");
    if (!UUID_PATTERN.test(tenantId)) throw new SetupError("DEV_TENANT_ID must be a UUID.");
    if (!name) throw new SetupError("DEV_TENANT_NAME must not be blank.");

    const result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { email },
        select: {
          id: true,
          accounts: {
            where: { providerId: "credential", password: { not: null } },
            select: { id: true },
          },
        },
      });
      if (!user || user.accounts.length === 0) {
        throw new SetupError("An existing development user with credentials is required. Run npm run db:create-dev-user first.");
      }

      const tenant = await transaction.tenant.findUnique({
        where: { id: tenantId },
        select: {
          memberships: {
            where: { userId: user.id },
            select: { id: true },
          },
        },
      });
      if (tenant) {
        if (tenant.memberships.length === 0) {
          throw new SetupError("The configured company already exists without this user's membership. No access was granted.");
        }
        return "existing";
      }

      await transaction.tenant.create({
        data: {
          id: tenantId,
          name,
          memberships: {
            create: { userId: user.id, role: "ADMIN", isActive: true },
          },
        },
      });
      return "created";
    });

    console.log(result === "created"
      ? "Development company and administrator membership created."
      : "Development company already exists. No name, role or active status changes made.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof SetupError
    ? error.message
    : "Development company setup failed. Check database availability, migrations and configuration.");
  process.exitCode = 1;
});
