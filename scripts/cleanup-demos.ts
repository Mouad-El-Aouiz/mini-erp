import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { cleanupExpiredDemos } from "./demo-cleanup";
import { validateStagingTarget } from "./staging-bootstrap";

async function main() {
  if (process.env.DEMO_CLEANUP_CONFIRM !== "mini-erp-demo-cleanup") throw new Error("Explicit demo cleanup confirmation is required.");
  const url = new URL(process.env.DATABASE_URL ?? "");
  const localTest = ["localhost", "127.0.0.1"].includes(url.hostname) && ["/mini_erp_test", "/mini_erp_ci"].includes(url.pathname);
  if (!localTest) validateStagingTarget(process.env);
  const removed = await cleanupExpiredDemos(prisma);
  console.log(`Expired demo workspaces removed: ${removed}`);
}
main().catch(() => { console.error("Demo cleanup failed. Inspect the configured target and demo records."); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
