import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { getInventoryHistory } from "@/lib/inventory-data";
import { ProductNotFoundError } from "@/lib/product-data";
import { entityIdSchema, pageNumberSchema } from "@/lib/validation/common";
import { AdjustmentForm } from "./adjustment-form";
import workspace from "@/app/dashboard/workspace.module.css";
import styles from "../../business.module.css";
export default async function StockHistoryPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; productId: string }>;
  searchParams: Promise<{ page?: string | string[]; saved?: string | string[] }>;
}) {
  const { tenantId, productId } = await params;
  const access = await requireTenantPageAccess(tenantId);
  if (!entityIdSchema.safeParse(productId).success) notFound();
  const query = await searchParams;
  const page = pageNumberSchema.safeParse(query.page);
  const base = `/tenants/${access.tenantId}/inventory/${productId}`;
  if (!page.success) return <main className={workspace.workspace}><h1>Invalid page number</h1><Link href={base}>Return to stock history</Link></main>;
  const result = await getInventoryHistory(access, productId, page.data).catch((error: unknown) => {
    if (error instanceof ProductNotFoundError) notFound();
    throw error;
  });
  return <main className={workspace.workspace}>
    <Link href={`/tenants/${access.tenantId}/inventory`} prefetch={false}>Back to inventory</Link>
    <h1>Stock history</h1><p>Company: {access.tenantName}</p>
    <section className={styles.card}><h2>{result.product.name}</h2><p>SKU: {result.product.sku}</p><p>Physical quantity: {result.physicalQuantity}</p><p>Reserved quantity: {result.reservedQuantity}</p><p>Available quantity: {result.availableQuantity}</p></section>
    {query.saved === "1" && <p role="status" className={styles.notice}>Stock adjustment recorded.</p>}
    {access.role === "ADMIN" && <section><h2>Adjust stock</h2><AdjustmentForm tenantId={access.tenantId} productId={result.product.id} /></section>}
    <section aria-labelledby="movements-title"><h2 id="movements-title">Movements</h2>
      {result.movements.length === 0 ? <p>No stock movements on this page.</p> :
        <ul className={styles.list} aria-label="Stock movements">{result.movements.map((movement) => <li key={movement.id} className={styles.card}>
          <h3>Adjustment: {movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</h3>
          <p>Reason: {movement.reason}</p><p>Recorded by: {movement.recordedByName}</p>
          <p><time dateTime={movement.createdAt.toISOString()}>{movement.createdAt.toISOString().replace("T", " ").replace("Z", " UTC")}</time></p>
        </li>)}</ul>}
      <nav aria-label="Movement pages" className={styles.pagination}>
        {page.data > 1 && <Link href={`${base}?page=${page.data - 1}`} prefetch={false}>Previous page</Link>}
        <span>Page {page.data}</span>
        {result.hasNextPage && page.data < 9999 && <Link href={`${base}?page=${page.data + 1}`} prefetch={false}>Next page</Link>}
      </nav>
    </section>
  </main>;
}
