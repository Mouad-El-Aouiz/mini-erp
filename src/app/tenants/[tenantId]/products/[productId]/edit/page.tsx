import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { getProduct, ProductNotFoundError } from "@/lib/product-data";
import { entityIdSchema as productIdSchema } from "@/lib/validation/common";
import { ProductForm } from "../../product-form";
import styles from "@/app/dashboard/workspace.module.css";

export default async function EditProductPage({ params }: {
  params: Promise<{ tenantId: string; productId: string }>;
}) {
  const { tenantId, productId } = await params;
  const access = await requireTenantPageAccess(tenantId);
  if (access.role !== "ADMIN") notFound();
  if (!productIdSchema.safeParse(productId).success) notFound();
  const product = await getProduct(access, productId).catch((error: unknown) => {
    if (error instanceof ProductNotFoundError) notFound();
    throw error;
  });
  return (
    <main className={styles.workspace}>
      <Link href={`/tenants/${access.tenantId}/products`} prefetch={false}>Back to products</Link>
      <h1>Edit product</h1>
      <p>Company: {access.tenantName}</p>
      <ProductForm tenantId={access.tenantId} product={{
        id: product.id, sku: product.sku, name: product.name, unitPriceCents: product.unitPriceCents,
      }} />
    </main>
  );
}
