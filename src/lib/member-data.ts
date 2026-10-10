import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockActiveMembership, type TenantAccess } from "@/lib/membership-lock";
import type { CreateMemberInput, UpdateMemberInput } from "@/lib/validation/member";

export class MemberOperationError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const select = {
  id: true, role: true, isActive: true, version: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.MembershipSelect;
export const MEMBER_PAGE_SIZE = 20;

// Every membership writer takes this transaction lock before actor/target locks.
// Serializing company administration prevents two administrators from both
// observing another active administrator and removing the final two at once.
async function lockCompany(transaction: Prisma.TransactionClient, tenantId: string) {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 42001))`;
}

export async function listMembers(access: TenantAccess, page: number) {
  return prisma.$transaction(async transaction => {
    await lockActiveMembership(transaction, access, "ADMIN");
    const rows = await transaction.membership.findMany({
      where: { tenantId: access.tenantId }, select,
      orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
      skip: (page - 1) * MEMBER_PAGE_SIZE, take: MEMBER_PAGE_SIZE + 1,
    });
    return { members: rows.slice(0, MEMBER_PAGE_SIZE), page,
      pageSize: MEMBER_PAGE_SIZE, hasNextPage: rows.length > MEMBER_PAGE_SIZE };
  });
}

export async function createMember(access: TenantAccess, input: CreateMemberInput) {
  // Hash before opening the transaction; never persist or return plaintext.
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async transaction => {
    await lockCompany(transaction, access.tenantId);
    await lockActiveMembership(transaction, access, "ADMIN");
    // Do not reset, attach, or disclose an existing global identity.
    const existing = await transaction.user.findFirst({
      where: { email: { equals: input.email, mode: "insensitive" } }, select: { id: true },
    });
    if (existing) throw new MemberOperationError(409, "Unable to create this account. Use another email address.");
    const userId = randomUUID();
    await transaction.user.create({
      data: { id: userId, name: input.name, email: input.email,
        accounts: { create: { id: randomUUID(), accountId: userId,
          providerId: "credential", password: passwordHash } } },
    });
    return transaction.membership.create({
      data: { tenantId: access.tenantId, userId, role: input.role }, select,
    });
  }, { timeout: 15_000 });
}

export async function updateMember(access: TenantAccess, membershipId: string, input: UpdateMemberInput) {
  return prisma.$transaction(async transaction => {
    await lockCompany(transaction, access.tenantId);
    await lockActiveMembership(transaction, access, "ADMIN");
    const rows = await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM memberships
      WHERE id = ${membershipId}::uuid AND tenant_id = ${access.tenantId}::uuid FOR UPDATE
    `;
    if (!rows.length) throw new MemberOperationError(404, "Member not found.");
    const member = await transaction.membership.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: access.tenantId, id: membershipId } },
    });
    if (member.version !== input.version) throw new MemberOperationError(409, "This member changed. Reload before saving.");
    const removesAdmin = member.isActive && member.role === "ADMIN"
      && (!input.isActive || input.role !== "ADMIN");
    if (removesAdmin) {
      const admins = await transaction.membership.count({
        where: { tenantId: access.tenantId, isActive: true, role: "ADMIN" },
      });
      if (admins <= 1) throw new MemberOperationError(409, "The company must keep at least one active administrator.");
    }
    if (member.role === input.role && member.isActive === input.isActive) {
      return transaction.membership.findUniqueOrThrow({ where: { id: member.id }, select });
    }
    return transaction.membership.update({
      where: { id: member.id },
      data: { role: input.role, isActive: input.isActive, version: { increment: 1 } },
      select,
    });
  }, { timeout: 15_000 });
}
