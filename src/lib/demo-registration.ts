import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { DemoSignupInput } from "@/lib/validation/demo";

export class DemoRegistrationError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
import { demoRegistrationEnabled } from "@/lib/demo-config";
const signupLock = 781909221;

export async function registerDemo(input: DemoSignupInput) {
  if (!demoRegistrationEnabled()) throw new DemoRegistrationError(404, "Demo registration is unavailable.");
  // Persist the global budget before expensive password hashing, including failed attempts.
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${signupLock})`;
    await tx.demoSignupAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400000) } } });
    const attempts = await tx.demoSignupAttempt.count({ where: { createdAt: { gte: new Date(Date.now() - 3600000) } } });
    if (attempts >= 20) throw new DemoRegistrationError(429, "Demo registration is busy. Try again later.");
    await tx.demoSignupAttempt.create({ data: {} });
  });
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${signupLock})`;
      if (await tx.tenant.count({ where: { demoOwnerId: { not: null } } }) >= 100)
        throw new DemoRegistrationError(429, "Demo capacity reached. Try again later.");
      if (await tx.user.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } }, select: { id: true } }))
        throw new DemoRegistrationError(409, "Unable to create this demo account. Sign in if you already registered.");
      const userId = randomUUID();
      await tx.user.create({ data: { id: userId, name: input.name, email: input.email,
        accounts: { create: { id: randomUUID(), accountId: userId, providerId: "credential", password: passwordHash } } } });
      const tenant = await tx.tenant.create({ data: { name: "Your demo company", demoOwnerId: userId,
        demoExpiresAt: new Date(Date.now() + 86400000), memberships: { create: { userId, role: "ADMIN" } } }, select: { id: true } });
      await tx.customer.createMany({ data: ["Example Business A", "Example Business B"].map(companyName => ({
        tenantId: tenant.id, companyName, contactName: "Fictional contact", email: "contact@example.invalid",
      })) });
      for (const [sku, name, unitPriceCents] of [["DEMO-LAPTOP", "Demo laptop", 89900], ["DEMO-MONITOR", "Demo monitor", 24900], ["DEMO-KEYBOARD", "Demo keyboard", 4900]] as const) {
        await tx.product.create({ data: { tenantId: tenant.id, sku, name, unitPriceCents,
          inventoryBalance: { create: { physicalQuantity: 50 } } } });
      }
      return tenant.id;
    }, { timeout: 15000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new DemoRegistrationError(409, "Unable to create this demo account. Sign in if you already registered.");
    throw error;
  }
}
