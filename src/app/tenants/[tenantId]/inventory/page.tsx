import Link from "next/link";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { listInventory } from "@/lib/inventory-data";
import { pageNumberSchema } from "@/lib/validation/common";
import workspace from "@/app/dashboard/workspace.module.css";
import styles from "../business.module.css";
export default async function InventoryPage({ params, searchParams }: {
  params: Promise<{ tenantId: string }>; searchParams: Promise<{ page?: string | string[] }>;
}) {
  const access = await requireTenantPageAccess((await params).tenantId);
  const page = pageNumberSchema.safeParse((await searchParams).page);
  const base = `/tenants/${access.tenantId}/inventory`;
  if (!page.success) return <main className={workspace.workspace}><h1>Invalid page number</h1><Link href={base}>Return to inventory</Link></main>;
  const result = await listInventory(access, page.data);
  return <main className={workspace.workspace}>
    <Link href={`/tenants/${access.tenantId}`} prefetch={false}>Back to workspace</Link>
    <div className={styles.toolbar}><div><h1>Inventory</h1><p>Company: {access.tenantName}</p></div></div>
    <p>Physical stock at your company&apos;s single stock location.</p>
    {result.inventory.length === 0 ? <section className={styles.card}><h2>No products on this page</h2><p>Add products to the catalog to get started.</p><Link href={`/tenants/${access.tenantId}/products`} prefetch={false}>View products</Link></section> :
      <ul className={styles.list} aria-label="Inventory">{result.inventory.map((product) => <li key={product.id} className={styles.card}>
        <h2>{product.name}</h2><p>SKU: {product.sku}</p><p>Physical quantity: {product.physicalQuantity}</p>
        <Link href={`${base}/${product.id}`} prefetch={false} aria-label={`View stock history for ${product.name}`}>View stock history</Link>
      </li>)}</ul>}
    <nav aria-label="Inventory pages" className={styles.pagination}>
      {page.data > 1 && <Link href={`${base}?page=${page.data - 1}`} prefetch={false}>Previous page</Link>}
      <span>Page {page.data}</span>
      {result.hasNextPage && page.data < 9999 && <Link href={`${base}?page=${page.data + 1}`} prefetch={false}>Next page</Link>}
    </nav>
  </main>;
}
