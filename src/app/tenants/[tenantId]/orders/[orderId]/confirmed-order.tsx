import type { OrderRecord } from "@/lib/order-data";
import { formatUsd } from "@/lib/validation/product";
import styles from "../../business.module.css";

export function ConfirmedOrder({order}:{order:OrderRecord}) {
  return <>
    <p>Status: Confirmed · Version: {order.version}</p>
    <p>Stock is reserved. Physical quantities remain unchanged until delivery.</p>
    <p>Confirmed at: <time dateTime={order.confirmedAt!.toISOString()}>{order.confirmedAt!.toISOString().replace("T"," ").replace("Z"," UTC")}</time></p>
    <p>Customer: {order.customer.companyName}</p>
    <p>Accepted details are locked. Delivery and cancellation will be available in a later release.</p>
    <ul className={styles.list} aria-label="Confirmed lines">{order.items.map(item=><li key={item.productId} className={styles.card}>
      <h2>{item.productName}</h2><p>SKU: {item.productSku}</p><p>Quantity: {item.quantity}</p>
      <p>Accepted unit price: {formatUsd(item.unitPriceCents)} USD</p><p>Line total: {formatUsd(item.lineTotalCents)} USD</p>
    </li>)}</ul>
    <section className={styles.card}><h2>Accepted totals</h2><p>Subtotal: {formatUsd(order.totals.subtotalCents)} USD</p>
      <p>Tax ({(order.totals.taxRateBps/100).toFixed(2)}%): {formatUsd(order.totals.taxCents)} USD</p>
      <p><strong>Total: {formatUsd(order.totals.totalCents)} USD</strong></p></section>
  </>;
}
