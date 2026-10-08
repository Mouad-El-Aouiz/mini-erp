import Link from "next/link";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { listProducts } from "@/lib/product-data";
import { pageNumberSchema as productPageSchema } from "@/lib/validation/common";
import { formatUsd } from "@/lib/validation/product";
import workspace from "@/app/dashboard/workspace.module.css";
import styles from "../business.module.css";

export default async function ProductsPage({ params, searchParams }: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ page?: string | string[]; saved?: string | string[] }>;
}) {
  const { tenantId } = await params;
  const access = await requireTenantPageAccess(tenantId);
  const query = await searchParams;
  const page = productPageSchema.safeParse(query.page);
  const baseURL = `/tenants/${access.tenantId}/products`;
  if (!page.success) {
    return <main className={workspace.workspace}><h1>Invalid page number</h1><Link href={baseURL} prefetch={false}>Return to products</Link></main>;
  }
  const result = await listProducts(access, page.data);
  return (
    <main className={workspace.workspace}>
      <Link href={`/tenants/${access.tenantId}`} prefetch={false}>Back to workspace</Link>
      <div className={styles.toolbar}><div><h1>Products</h1><p>Company: {access.tenantName}</p></div>{access.role === "ADMIN" && <Link href={`${baseURL}/new`} prefetch={false}>New product</Link>}</div>
      {query.saved === "created" && <p role="status" className={styles.notice}>Product created.</p>}
      {query.saved === "updated" && <p role="status" className={styles.notice}>Product updated.</p>}
      {result.products.length === 0 ? (
        <section className={styles.card}>
          <h2>{page.data === 1 ? "No products yet" : "No products on this page"}</h2>
          <p>An administrator can add computer hardware to the catalog.</p>
          {page.data > 1 && <Link href={baseURL} prefetch={false}>Return to first page</Link>}
        </section>
      ) : (
        <ul className={styles.list} aria-label="Products">
          {result.products.map((product) => (
            <li key={product.id} className={styles.card}>
              <h2>{product.name}</h2>
              <p>SKU: {product.sku}</p>
              <p>Unit price: {formatUsd(product.unitPriceCents)} USD · excluding tax</p>
              {access.role === "ADMIN" && <Link href={`${baseURL}/${product.id}/edit`} prefetch={false} aria-label={`Edit ${product.name}`}>Edit product</Link>}
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Product pages" className={styles.pagination}>
        {page.data > 1 && <Link href={`${baseURL}?page=${page.data - 1}`} prefetch={false}>Previous page</Link>}
        <span>Page {page.data}</span>
        {result.hasNextPage && <Link href={`${baseURL}?page=${page.data + 1}`} prefetch={false}>Next page</Link>}
      </nav>
    </main>
  );
}
