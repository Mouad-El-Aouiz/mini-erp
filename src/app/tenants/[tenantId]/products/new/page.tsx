import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { ProductForm } from "../product-form";
import styles from "@/app/dashboard/workspace.module.css";

export default async function NewProductPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const access = await requireTenantPageAccess(tenantId);
  if (access.role !== "ADMIN") notFound();
  return (
    <main className={styles.workspace}>
      <Link href={`/tenants/${access.tenantId}/products`} prefetch={false}>Back to products</Link>
      <h1>New product</h1>
      <p>Company: {access.tenantName}</p>
      <ProductForm tenantId={access.tenantId} />
    </main>
  );
}
