import { randomUUID } from "node:crypto";
import { test, afterEach, after } from "node:test";
import { expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { provisionStagingAdmin } from "../../scripts/staging-bootstrap";

const source = new URL(process.env.TEST_DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(source.hostname) || !["/mini_erp_test", "/mini_erp_ci"].includes(source.pathname)) {
  throw new Error("Staging bootstrap tests require the isolated test database.");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: source.toString() }) });
const tenantId = randomUUID();
const outsiderId = randomUUID();
const email = `staging-${tenantId}@example.test`;
const config = { email, tenantId, name: "Staging Fixture Admin", tenantName: "Staging Fixture Company", password: "Fixture-only-password-2026!" };

afterEach(async () => {
  await prisma.membership.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { OR: [{ email }, { id: outsiderId }] } });
});
after(async () => { await prisma.$disconnect(); });

test("staging bootstrap creates one administrator atomically and the account signs in", async () => {
  expect(await provisionStagingAdmin(prisma, config)).toBe("created");
  const member = await prisma.membership.findFirst({ where: { tenantId } });
  expect(member).toMatchObject({ role: "ADMIN", isActive: true });
  const response = await fetch(`${process.env.BETTER_AUTH_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: process.env.BETTER_AUTH_URL! },
    body: JSON.stringify({ email, password: config.password }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("session_token");
});
test("staging bootstrap replay preserves the password and company names", async () => {
  await provisionStagingAdmin(prisma, config);
  const before = await prisma.account.findFirst({ where: { user: { email } } });
  expect(await provisionStagingAdmin(prisma, { ...config, password: "Different-fixture-password-2026!", tenantName: "Changed company" })).toBe("existing");
  expect((await prisma.account.findFirst({ where: { user: { email } } }))?.password).toBe(before?.password);
  expect((await prisma.tenant.findUnique({ where: { id: tenantId } }))?.name).toBe(config.tenantName);
});
test("staging bootstrap does not promote or reactivate existing membership", async () => {
  await provisionStagingAdmin(prisma, config);
  await prisma.membership.updateMany({ where: { tenantId }, data: { role: "EMPLOYEE", isActive: false } });
  await expect(provisionStagingAdmin(prisma, config)).rejects.toThrow("Existing records");
  expect(await prisma.membership.findFirst({ where: { tenantId } })).toMatchObject({ role: "EMPLOYEE", isActive: false });
});
test("staging bootstrap rejects an unrelated populated database", async () => {
  await prisma.user.create({ data: { id: outsiderId, name: "Unrelated fixture", email: `${outsiderId}@example.test` } });
  await expect(provisionStagingAdmin(prisma, config)).rejects.toThrow("without users or companies");
  expect(await prisma.user.count({ where: { email } })).toBe(0);
  expect(await prisma.tenant.count({ where: { id: tenantId } })).toBe(0);
});
test("staging bootstrap concurrent retries produce a single account and company", async () => {
  expect((await Promise.all([provisionStagingAdmin(prisma, config), provisionStagingAdmin(prisma, config)])).sort()).toEqual(["created", "existing"]);
  expect(await prisma.user.count({ where: { email } })).toBe(1);
  expect(await prisma.membership.count({ where: { tenantId } })).toBe(1);
});
test("staging bootstrap rolls back credentials if company creation fails", async () => {
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_staging_bootstrap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture failure'; END $$");
  try {
    await prisma.$executeRawUnsafe("CREATE TRIGGER fail_staging_bootstrap BEFORE INSERT ON tenants FOR EACH ROW EXECUTE FUNCTION fail_staging_bootstrap()");
    try {
      await expect(provisionStagingAdmin(prisma, config)).rejects.toThrow();
      expect(await prisma.user.count({ where: { email } })).toBe(0);
      expect(await prisma.tenant.count({ where: { id: tenantId } })).toBe(0);
    } finally { await prisma.$executeRawUnsafe("DROP TRIGGER fail_staging_bootstrap ON tenants"); }
  } finally { await prisma.$executeRawUnsafe("DROP FUNCTION fail_staging_bootstrap()"); }
});
