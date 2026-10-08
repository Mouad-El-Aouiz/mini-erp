"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { customerSchema, type CustomerInput } from "@/lib/validation/customer";
import styles from "../business.module.css";

type InitialCustomer = CustomerInput & { id: string };
type Field = keyof CustomerInput;
const fields: { name: Field; label: string; maxLength: number; type?: string }[] = [
  { name: "companyName", label: "Company name", maxLength: 200 },
  { name: "contactName", label: "Contact name", maxLength: 150 },
  { name: "email", label: "Email", maxLength: 254, type: "email" },
  { name: "phone", label: "Phone", maxLength: 50, type: "tel" },
  { name: "address", label: "Address", maxLength: 1000 },
];

export function CustomerForm({ tenantId, customer }: { tenantId: string; customer?: InitialCustomer }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const listURL = `/tenants/${tenantId}/customers`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(fields.map(({ name }) => [name, form.get(name)]));
    const result = customerSchema.safeParse(input);
    setError("");
    setFieldErrors({});
    if (!result.success) {
      setFieldErrors(z.flattenError(result.error).fieldErrors);
      setError("Please correct the highlighted fields.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/customers${customer ? `/${customer.id}` : ""}`, {
        method: customer ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify(result.data),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "Unable to save the customer.");
        setFieldErrors(body.fieldErrors ?? {});
        return;
      }
      router.replace(`${listURL}?saved=${customer ? "updated" : "created"}`);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally { setPending(false); }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-busy={pending}>
      <p>Company name is required. All other fields are optional.</p>
      <fieldset className={styles.fields} disabled={pending}>
        <legend className="sr-only">Customer details</legend>
        {fields.map(({ name, label, maxLength, type }) => {
          const message = fieldErrors[name]?.[0];
          const props = {
            id: name, name, maxLength, defaultValue: customer?.[name] ?? "",
            required: name === "companyName", "aria-invalid": Boolean(message),
            "aria-describedby": message ? `${name}-error` : undefined,
          };
          return (
            <div key={name} className={styles.field}>
              <label htmlFor={name}>{label}</label>
              {name === "address" ? <textarea {...props} rows={4} /> : <input {...props} type={type ?? "text"} />}
              {message && <p id={`${name}-error`} className={styles.error}>{message}</p>}
            </div>
          );
        })}
      </fieldset>
      <p role="alert" className={styles.error}>{error}</p>
      <div className={styles.actions}>
        <button type="submit" disabled={pending}>{pending ? "Saving…" : customer ? "Save changes" : "Create customer"}</button>
        <Link href={listURL} prefetch={false}>Cancel</Link>
      </div>
    </form>
  );
}
