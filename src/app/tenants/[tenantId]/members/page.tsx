import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { listMembers } from "@/lib/member-data";
import { pageNumberSchema } from "@/lib/validation/common";
import { MemberControls } from "./member-form";
import workspace from "@/app/dashboard/workspace.module.css";
import styles from "../business.module.css";
export default async function MembersPage({ params, searchParams }: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ page?: string | string[]; created?: string; updated?: string }>;
}) {
  const { tenantId } = await params;
  const access = await requireTenantPageAccess(tenantId);
  if (access.role !== "ADMIN") notFound();
  const query = await searchParams;
  const page = pageNumberSchema.safeParse(query.page);
  const base = `/tenants/${access.tenantId}/members`;
  if (!page.success) return <main className={workspace.workspace}><h1>Invalid page number</h1><Link href={base}>Return to members</Link></main>;
  const result = await listMembers(access, page.data);
  return <main className={workspace.workspace}>
    <Link href={`/tenants/${access.tenantId}`} prefetch={false}>Back to workspace</Link>
    <div className={styles.toolbar}><div><h1>Members</h1><p>Company: {access.tenantName}</p></div><Link href={base + "/new"} prefetch={false}>New member</Link></div>
    <p>Changes affect access to this company only. Keep at least one active administrator.</p>
    {query.created === "1" && <p role="status" className={styles.notice}>Member created.</p>}
    {query.updated === "1" && <p role="status" className={styles.notice}>Member updated.</p>}
    <ul className={styles.list} aria-label="Company members">{result.members.map(member =>
      <li className={styles.card} key={`${member.id}-${member.version}`}>
        <h2>{member.user.name}{member.id === access.id ? " (you)" : ""}</h2><p>{member.user.email}</p>
        <p>Status: {member.isActive ? "Active" : "Inactive"}</p>
        <MemberControls tenantId={access.tenantId} member={member} currentMembershipId={access.id} />
      </li>)}</ul>
    {result.members.length === 0 && <p>No members on this page.</p>}
    <nav className={styles.pagination} aria-label="Member pages">
      {page.data > 1 && <Link href={`${base}?page=${page.data - 1}`} prefetch={false}>Previous page</Link>}
      <span>Page {page.data}</span>
      {result.hasNextPage && <Link href={`${base}?page=${page.data + 1}`} prefetch={false}>Next page</Link>}
    </nav>
  </main>;
}
