import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPageAccess } from "@/lib/tenant-page-access";
import { getOrder, OrderNotFoundError } from "@/lib/order-data";
import { entityIdSchema } from "@/lib/validation/common";
import { DraftEditor } from "./draft-editor";
import { AcceptedOrder } from "./accepted-order";
import styles from "@/app/dashboard/workspace.module.css";
export default async function OrderPage({params}:{params:Promise<{tenantId:string;orderId:string}>}) {
  const {tenantId,orderId}=await params;const access=await requireTenantPageAccess(tenantId);
  if(!entityIdSchema.safeParse(orderId).success)notFound();
  const order=await getOrder(access,orderId).catch((error:unknown)=>{if(error instanceof OrderNotFoundError)notFound();throw error;});
  return <main className={styles.workspace}><Link href={`/tenants/${access.tenantId}/orders`} prefetch={false}>Back to orders</Link><h1>{order.status==="DRAFT"?"Draft order":order.status==="CANCELLED"?"Cancelled order":order.status==="DELIVERED"?"Delivered order":"Confirmed order"}</h1><p>Company: {access.tenantName}</p><p>Order: {order.id}</p>
    {order.status!=="DRAFT"?<AcceptedOrder order={order} tenantId={access.tenantId} canCancel={access.role==="ADMIN"}/>:<DraftEditor tenantId={access.tenantId} initial={{status:order.status,id:order.id,version:order.version,customerId:order.customerId,customer:order.customer,items:order.items,totals:order.totals,taxVersion:order.taxVersion}}/>}
  </main>;
}
