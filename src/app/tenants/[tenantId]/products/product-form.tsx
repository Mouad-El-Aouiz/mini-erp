"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { productSchema, usdPriceSchema, centsToUsdInput, type ProductInput } from "@/lib/validation/product";
import styles from "../business.module.css";

type InitialProduct = ProductInput & { id: string };
const fields = [
  { name: "sku", label: "SKU", maxLength: 64 },
  { name: "name", label: "Product name", maxLength: 200 },
  { name: "price", label: "Unit price (USD, excluding tax)", maxLength: 11 },
] as const;

export function ProductForm({ tenantId, product }: { tenantId: string; product?: InitialProduct }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const listURL = `/tenants/${tenantId}/products`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const price = usdPriceSchema.safeParse(form.get("price"));
    const result = productSchema.safeParse({ sku: form.get("sku"), name: form.get("name"),
      unitPriceCents: price.success ? price.data : -1 });
    setError("");
    setFieldErrors({});
    if (!result.success || !price.success) {
      const errors: Record<string, string[] | undefined> = result.success ? {} : z.flattenError(result.error).fieldErrors;
      if (!price.success) errors.price = [price.error.issues[0].message];
      setFieldErrors(errors);
      setError("Please correct the highlighted fields.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/products${product ? `/${product.id}` : ""}`, {
        method: product ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify(result.data),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "Unable to save the product.");
        setFieldErrors({ ...body.fieldErrors, price: body.fieldErrors?.unitPriceCents });
        return;
      }
      router.replace(`${listURL}?saved=${product ? "updated" : "created"}`);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally { setPending(false); }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-busy={pending}>
      <p>All fields are required. SKU is unique within this company and saved in uppercase. Prices exclude tax.</p>
      <fieldset className={styles.fields} disabled={pending}>
        <legend className="sr-only">Product details</legend>
        {fields.map(({ name, label, maxLength }) => {
          const message = fieldErrors[name]?.[0];
          const props = {
            id: name, name, maxLength, defaultValue: name === "price" ? (product ? centsToUsdInput(product.unitPriceCents) : "") : product?.[name] ?? "",
            required: true, "aria-invalid": Boolean(message),
            "aria-describedby": message ? `${name}-error` : undefined,
          };
          return (
            <div key={name} className={styles.field}>
              <label htmlFor={name}>{label}</label>
              <input {...props} type="text" inputMode={name === "price" ? "decimal" : undefined} />
              {message && <p id={`${name}-error`} className={styles.error}>{message}</p>}
            </div>
          );
        })}
      </fieldset>
      <p role="alert" className={styles.error}>{error}</p>
      <div className={styles.actions}>
        <button type="submit" disabled={pending}>{pending ? "Saving…" : product ? "Save changes" : "Create product"}</button>
        <Link href={listURL} prefetch={false}>Cancel</Link>
      </div>
    </form>
  );
}
