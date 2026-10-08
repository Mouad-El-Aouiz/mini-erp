import Link from "next/link";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { NewDraftForm } from "./new-draft-form";
import styles from "@/app/dashboard/workspace.module.css";
export default async function NewDraftPage({params}:{params:Promise<{tenantId:string}>}) {
  const access=await requireTenantPageAccess((await params).tenantId);
  return <main className={styles.workspace}><Link href={`/tenants/${access.tenantId}/orders`} prefetch={false}>Back to orders</Link><h1>New draft order</h1><p>Company: {access.tenantName}</p><NewDraftForm tenantId={access.tenantId}/></main>;
}
