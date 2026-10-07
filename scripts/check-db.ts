import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  try {
    const tenantCount = await prisma.tenant.count();

    console.log("Database connection verified.");
    console.log(`Tenant count: ${tenantCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Database verification failed. Check configuration, database availability and migrations.",
  );
  process.exitCode = 1;
});