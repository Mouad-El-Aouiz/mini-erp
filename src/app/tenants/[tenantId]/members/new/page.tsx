import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { NewMemberForm } from "../member-form";
import workspace from "@/app/dashboard/workspace.module.css";
export default async function NewMemberPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const access = await requireTenantPageAccess(tenantId);
  if (access.role !== "ADMIN") notFound();
  return <main className={workspace.workspace}><Link href={`/tenants/${access.tenantId}/members`} prefetch={false}>Back to members</Link><h1>New member</h1><NewMemberForm tenantId={access.tenantId} /></main>;
}
