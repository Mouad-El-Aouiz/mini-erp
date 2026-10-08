"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { adjustmentSchema, quantityChangeSchema } from "@/lib/validation/inventory";
import styles from "../../business.module.css";

export function AdjustmentForm({ tenantId, productId }: { tenantId: string; productId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const attempt = useRef<{ signature: string; requestId: string } | null>(null);
  // Retain the key after a lost response; unchanged input can be retried safely.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const delta = quantityChangeSchema.safeParse(form.get("quantityDelta"));
    const signature = JSON.stringify([form.get("quantityDelta"), form.get("reason")]);
    if (attempt.current?.signature !== signature) attempt.current = { signature, requestId: crypto.randomUUID() };
    const result = adjustmentSchema.safeParse({ requestId: attempt.current.requestId,
      quantityDelta: delta.success ? delta.data : 0, reason: form.get("reason") });
    setError(""); setFieldErrors({});
    if (!delta.success || !result.success) {
      const errors: Record<string, string[] | undefined> = result.success ? {} : z.flattenError(result.error).fieldErrors;
      if (!delta.success) errors.quantityDelta = [delta.error.issues[0].message];
      setFieldErrors(errors); setError("Please correct the highlighted fields."); return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/inventory/${productId}/movements`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.data),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Unable to adjust stock."); setFieldErrors(body.fieldErrors ?? {}); return; }
      attempt.current = null;
      formElement.reset();
      router.replace(`/tenants/${tenantId}/inventory/${productId}?saved=1`);
      router.refresh();
    } catch { setError("Unable to reach the server. Keep the same values and retry to avoid recording the adjustment twice."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} noValidate aria-busy={pending} className={styles.form}>
    <p>Enter a positive quantity to add stock, or a negative quantity to remove it. Record a reason for every adjustment.</p>
    <fieldset disabled={pending} className={styles.fields}><legend className="sr-only">Stock adjustment</legend>
      <div className={styles.field}><label htmlFor="quantityDelta">Quantity change</label>
        <input id="quantityDelta" name="quantityDelta" type="text" inputMode="text" required maxLength={11}
          aria-invalid={Boolean(fieldErrors.quantityDelta)} aria-describedby={fieldErrors.quantityDelta ? "quantity-error" : undefined} />
        {fieldErrors.quantityDelta && <p id="quantity-error" className={styles.error}>{fieldErrors.quantityDelta[0]}</p>}
      </div>
      <div className={styles.field}><label htmlFor="reason">Reason</label>
        <textarea id="reason" name="reason" rows={3} required maxLength={500}
          aria-invalid={Boolean(fieldErrors.reason)} aria-describedby={fieldErrors.reason ? "reason-error" : undefined} />
        {fieldErrors.reason && <p id="reason-error" className={styles.error}>{fieldErrors.reason[0]}</p>}
      </div>
    </fieldset>
    <p role="alert" className={styles.error}>{error}</p>
    <div className={styles.actions}><button type="submit" disabled={pending}>{pending ? "Recording..." : "Record adjustment"}</button></div>
  </form>;
}
