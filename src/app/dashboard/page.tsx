import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "./sign-out-button";
import styles from "./workspace.module.css";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id, isActive: true },
    select: { id: true, role: true, tenant: { select: { id: true, name: true } } },
    orderBy: [{ tenant: { name: "asc" } }, { tenantId: "asc" }],
  });

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mini ERP</p>
          <h1>Choose your company</h1>
          <p>Welcome, {session.user.name}. Select a company to open its workspace.</p>
        </div>
        <SignOutButton />
      </header>
      {memberships.length === 0 ? (
        <section className={styles.empty} aria-labelledby="no-companies">
          <h2 id="no-companies">No companies available</h2>
          <p>You do not have an active company membership. Contact your company administrator.</p>
        </section>
      ) : (
        <ul className={styles.companies} aria-label="Your companies">
          {memberships.map(({ id, role, tenant }) => (
            <li key={id} className={styles.card}>
              <h2>{tenant.name}</h2>
              <p>Your role: <strong>{role === "ADMIN" ? "Administrator" : "Employee"}</strong></p>
              <Link href={`/tenants/${tenant.id}`} prefetch={false}
                aria-label={`Open ${tenant.name} workspace`}>
                Open workspace <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
