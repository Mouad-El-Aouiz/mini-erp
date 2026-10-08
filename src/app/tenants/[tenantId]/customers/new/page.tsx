import Link from "next/link";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { CustomerForm } from "../customer-form";
import styles from "@/app/dashboard/workspace.module.css";

export default async function NewCustomerPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const access = await requireTenantPageAccess(tenantId);
  return (
    <main className={styles.workspace}>
      <Link href={`/tenants/${access.tenantId}/customers`} prefetch={false}>Back to customers</Link>
      <h1>New customer</h1>
      <p>Company: {access.tenantName}</p>
      <CustomerForm tenantId={access.tenantId} />
    </main>
  );
}
