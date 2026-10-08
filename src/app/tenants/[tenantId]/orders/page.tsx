import Link from "next/link";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { listOrders } from "@/lib/order-data";
import { pageNumberSchema } from "@/lib/validation/common";
import workspace from "@/app/dashboard/workspace.module.css";
import styles from "../business.module.css";
export default async function OrdersPage({params,searchParams}:{params:Promise<{tenantId:string}>;searchParams:Promise<{page?:string|string[]}>}) {
  const access=await requireTenantPageAccess((await params).tenantId);const page=pageNumberSchema.safeParse((await searchParams).page);
  const base=`/tenants/${access.tenantId}/orders`;
  if(!page.success)return <main className={workspace.workspace}><h1>Invalid page number</h1><Link href={base}>Return to orders</Link></main>;
  const result=await listOrders(access,page.data);
  return <main className={workspace.workspace}><Link href={`/tenants/${access.tenantId}`} prefetch={false}>Back to workspace</Link>
    <div className={styles.toolbar}><div><h1>Orders</h1><p>Company: {access.tenantName}</p></div><Link href={`${base}/new`} prefetch={false}>New draft</Link></div>
    {result.orders.length===0?<section className={styles.card}><h2>No orders on this page</h2><p>Create a draft for a business customer.</p></section>:<ul className={styles.list} aria-label="Orders">{result.orders.map(order=><li key={order.id} className={styles.card}>
      <h2>{order.customer.companyName}</h2><p>Order: {order.id}</p><p>Status: {order.status==="DRAFT"?"Draft":order.status==="CANCELLED"?"Cancelled":order.status==="DELIVERED"?"Delivered":"Confirmed"}</p><p>Product lines: {order.itemCount}</p><Link href={`${base}/${order.id}`} prefetch={false}>{order.status!=="DRAFT"?"View order":"Open draft"}</Link>
    </li>)}</ul>}
    <nav aria-label="Order pages" className={styles.pagination}>{page.data>1&&<Link href={`${base}?page=${page.data-1}`} prefetch={false}>Previous page</Link>}<span>Page {page.data}</span>{result.hasNextPage&&page.data<9999&&<Link href={`${base}?page=${page.data+1}`} prefetch={false}>Next page</Link>}</nav>
  </main>;
}
