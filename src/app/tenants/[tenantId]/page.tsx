import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantAccess, TenantAccessError } from "@/lib/tenant-access";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/app/dashboard/sign-out-button";
import styles from "@/app/dashboard/workspace.module.css";

export default async function TenantWorkspacePage({
  params,
}: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const membership = await requireTenantAccess(tenantId).catch((error: unknown) => {
    if (error instanceof TenantAccessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      notFound();
    }
    throw error;
  });

  const tenant = await prisma.tenant.findFirst({
    where: {
      id: membership.tenantId,
      memberships: { some: { id: membership.id, userId: membership.userId, isActive: true } },
    },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard" prefetch={false}>Choose another company</Link>
          <h1>{tenant.name}</h1>
          <p>Your role: <strong>{membership.role === "ADMIN" ? "Administrator" : "Employee"}</strong></p>
        </div>
        <SignOutButton />
      </header>
      <section className={styles.empty} aria-labelledby="workspace-title">
        <h2 id="workspace-title">Company workspace</h2>
        <p>Manage the customers, product catalog and stock of this company.</p>
        <Link href={`/tenants/${tenant.id}/customers`} prefetch={false}>Manage customers</Link>
        <p><Link href={`/tenants/${tenant.id}/products`} prefetch={false}>Manage products</Link></p>
        <p><Link href={`/tenants/${tenant.id}/inventory`} prefetch={false}>Manage inventory</Link></p>
      </section>
    </main>
  );
}
