"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cancellationReasonSchema } from "@/lib/validation/order";
import styles from "../../business.module.css";

export function CancellationAction({ tenantId, orderId, version }: { tenantId: string; orderId: string; version: number }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = cancellationReasonSchema.safeParse(reason);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/orders/${orderId}/cancel`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, reason: parsed.data }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Unable to cancel this order."); return; }
      router.refresh();
    } catch {
      setError("Unable to complete the request. Reload the order to check whether cancellation was recorded before retrying.");
    } finally { setPending(false); }
  }
  return <form onSubmit={event => void cancel(event)} className={styles.form} aria-label="Order cancellation" aria-busy={pending}>
    <h2>Cancel confirmed order</h2>
    <p>This ends the order and releases all its reserved quantities. Physical stock stays unchanged. A cancelled order cannot be reopened or delivered.</p>
    <fieldset disabled={pending} className={styles.fields}>
      <div className={styles.field}><label htmlFor="cancellation-reason">Cancellation reason</label>
        <textarea id="cancellation-reason" required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} aria-describedby="cancellation-error" /></div>
      <div className={styles.actions}><button type="submit">{pending ? "Cancelling..." : "Cancel confirmed order"}</button>
        <button type="button" onClick={() => { setError(""); router.refresh(); }}>Reload before cancellation</button></div>
    </fieldset>
    <p id="cancellation-error" role="alert" className={styles.error}>{error}</p>
  </form>;
}
