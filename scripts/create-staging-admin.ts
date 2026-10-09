import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { StagingSetupError, validateStagingTarget, readStagingAdminConfig, provisionStagingAdmin } from "./staging-bootstrap";

async function main() {
  // Validate injected settings before constructing a client; never load the local .env.
  const connectionString = validateStagingTarget(process.env);
  const config = readStagingAdminConfig(process.env);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 10000 }) });
  try {
    const result = await provisionStagingAdmin(prisma, config);
    console.log(result === "created"
      ? "Staging administrator, credentials and company created atomically."
      : "Staging administrator already exists. No credentials or permissions changed.");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof StagingSetupError ? error.message : "Staging bootstrap failed. Check configuration, database availability and migrations.");
  process.exitCode = 1;
});
