import Link from "next/link";
import { requireCustomerPageAccess } from "@/lib/customer-page-access";
import { listCustomers } from "@/lib/customer-data";
import { customerPageSchema } from "@/lib/validation/customer";
import workspace from "@/app/dashboard/workspace.module.css";
import styles from "./customers.module.css";

export default async function CustomersPage({ params, searchParams }: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ page?: string | string[]; saved?: string | string[] }>;
}) {
  const { tenantId } = await params;
  const access = await requireCustomerPageAccess(tenantId);
  const query = await searchParams;
  const page = customerPageSchema.safeParse(query.page);
  const baseURL = `/tenants/${access.tenantId}/customers`;
  if (!page.success) {
    return <main className={workspace.workspace}><h1>Invalid page number</h1><Link href={baseURL} prefetch={false}>Return to customers</Link></main>;
  }
  const result = await listCustomers(access, page.data);
  return (
    <main className={workspace.workspace}>
      <Link href={`/tenants/${access.tenantId}`} prefetch={false}>Back to workspace</Link>
      <div className={styles.toolbar}><div><h1>Customers</h1><p>Company: {access.tenantName}</p></div><Link href={`${baseURL}/new`} prefetch={false}>New customer</Link></div>
      {query.saved === "created" && <p role="status" className={styles.notice}>Customer created.</p>}
      {query.saved === "updated" && <p role="status" className={styles.notice}>Customer updated.</p>}
      {result.customers.length === 0 ? (
        <section className={styles.card}>
          <h2>{page.data === 1 ? "No customers yet" : "No customers on this page"}</h2>
          <p>Add a business customer to get started.</p>
          {page.data > 1 && <Link href={baseURL} prefetch={false}>Return to first page</Link>}
        </section>
      ) : (
        <ul className={styles.list} aria-label="Customers">
          {result.customers.map((customer) => (
            <li key={customer.id} className={styles.card}>
              <h2>{customer.companyName}</h2>
              {customer.contactName && <p>Contact: {customer.contactName}</p>}
              {customer.email && <p>Email: {customer.email}</p>}
              {customer.phone && <p>Phone: {customer.phone}</p>}
              <Link href={`${baseURL}/${customer.id}/edit`} prefetch={false} aria-label={`Edit ${customer.companyName}`}>Edit customer</Link>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Customer pages" className={styles.pagination}>
        {page.data > 1 && <Link href={`${baseURL}?page=${page.data - 1}`} prefetch={false}>Previous page</Link>}
        <span>Page {page.data}</span>
        {result.hasNextPage && <Link href={`${baseURL}?page=${page.data + 1}`} prefetch={false}>Next page</Link>}
      </nav>
    </main>
  );
}
