import { CancellationAction } from "./cancellation-action";
import { DeliveryAction } from "./delivery-action";
import type { OrderRecord } from "@/lib/order-data";
import { formatUsd } from "@/lib/validation/product";
import styles from "../../business.module.css";

export function AcceptedOrder({order,tenantId,canCancel}:{order:OrderRecord;tenantId:string;canCancel:boolean}) {
  return <>
    <p>Status: {order.status==="CANCELLED"?"Cancelled":order.status==="DELIVERED"?"Delivered":"Confirmed"} · Version: {order.version}</p>
    <p>{order.status==="CANCELLED"?"Cancellation recorded. Stock reservations have been released; physical stock is unchanged.":order.status==="DELIVERED"?"Delivery recorded. Stock reservations have been consumed.":"Stock is reserved. Physical quantities remain unchanged until delivery."}</p>
    <p>Confirmed at: <time dateTime={order.confirmedAt!.toISOString()}>{order.confirmedAt!.toISOString().replace("T"," ").replace("Z"," UTC")}</time></p>
    <p>Customer: {order.customer.companyName}</p>
    <p>Accepted prices, tax and totals are preserved.</p>
    {order.delivery&&<section className={styles.card}><h2>Delivery recorded</h2>
      <p>Delivered at: <time dateTime={order.delivery.deliveredAt.toISOString()}>{order.delivery.deliveredAt.toISOString().replace("T"," ").replace("Z"," UTC")}</time></p>
      <p>Recorded by: {order.delivery.deliveredByName}</p>
    </section>}
    {order.cancellation&&<section className={styles.card}><h2>Cancellation recorded</h2>
      <p>Cancelled at: <time dateTime={order.cancellation.cancelledAt.toISOString()}>{order.cancellation.cancelledAt.toISOString().replace("T"," ").replace("Z"," UTC")}</time></p>
      <p>Cancelled by: {order.cancellation.cancelledByName}</p>
      <p>Reason: {order.cancellation.reason}</p>
    </section>}
    <ul className={styles.list} aria-label="Confirmed lines">{order.items.map(item=><li key={item.productId} className={styles.card}>
      <h2>{item.productName}</h2><p>SKU: {item.productSku}</p><p>Quantity: {item.quantity}</p>
      <p>Accepted unit price: {formatUsd(item.unitPriceCents)} USD</p><p>Line total: {formatUsd(item.lineTotalCents)} USD</p>
    </li>)}</ul>
    <section className={styles.card}><h2>Accepted totals</h2><p>Subtotal: {formatUsd(order.totals.subtotalCents)} USD</p>
      <p>Tax ({(order.totals.taxRateBps/100).toFixed(2)}%): {formatUsd(order.totals.taxCents)} USD</p>
      <p><strong>Total: {formatUsd(order.totals.totalCents)} USD</strong></p></section>
    {order.status==="CONFIRMED"&&<DeliveryAction tenantId={tenantId} orderId={order.id} version={order.version}/>}
    {order.status==="CONFIRMED"&&canCancel&&<CancellationAction tenantId={tenantId} orderId={order.id} version={order.version}/>}
  </>;
}
