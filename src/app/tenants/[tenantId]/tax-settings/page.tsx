import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { getTaxSettings } from "@/lib/order-data";
import { TaxForm } from "./tax-form";
import styles from "@/app/dashboard/workspace.module.css";
export default async function TaxSettingsPage({params}:{params:Promise<{tenantId:string}>}) {
  const access=await requireTenantPageAccess((await params).tenantId);if(access.role!=="ADMIN")notFound();
  return <main className={styles.workspace}><Link href={`/tenants/${access.tenantId}`} prefetch={false}>Back to workspace</Link><h1>Tax settings</h1><p>Company: {access.tenantName}</p><TaxForm tenantId={access.tenantId} initial={await getTaxSettings(access)}/></main>;
}
