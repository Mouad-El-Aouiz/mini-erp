"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { createMemberSchema, updateMemberSchema } from "@/lib/validation/member";
import styles from "../business.module.css";

type Member = { id: string; role: "ADMIN" | "EMPLOYEE"; isActive: boolean; version: number; user: { name: string; email: string } };
export function NewMemberForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const result = createMemberSchema.safeParse(Object.fromEntries(form));
    setError(""); setFields({});
    if (!result.success) { setFields(z.flattenError(result.error).fieldErrors); setError("Please correct the highlighted fields."); return; }
    setPending(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(result.data),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Unable to create the account."); setFields(body.fieldErrors ?? {}); return; }
      router.replace(`/tenants/${tenantId}/members?created=1`); router.refresh();
    } catch { setError("Unable to reach the server. Reload the member list before retrying an uncertain creation."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className={styles.form} noValidate aria-busy={pending}>
    <p>Create a new account. Share its initial password privately with the member. Existing accounts cannot be attached or reset here.</p>
    <fieldset className={styles.fields} disabled={pending}><legend className="sr-only">New member details</legend>
      {([{ name: "name", label: "Full name", type: "text", max: 200 }, { name: "email", label: "Email", type: "email", max: 254 }, { name: "password", label: "Initial password", type: "password", max: 128 }] as const).map(field =>
        <div className={styles.field} key={field.name}>
          <label htmlFor={field.name}>{field.label}</label>
          <input id={field.name} name={field.name} type={field.type} maxLength={field.max} required autoComplete={field.name === "password" ? "new-password" : field.name} aria-invalid={Boolean(fields[field.name])} aria-describedby={fields[field.name] ? `${field.name}-error` : undefined} />
          {fields[field.name] && <p className={styles.error} id={`${field.name}-error`}>{fields[field.name]?.[0]}</p>}
        </div>)}
      <div className={styles.field}><label htmlFor="role">Role</label><select id="role" name="role" defaultValue="EMPLOYEE"><option value="EMPLOYEE">Employee</option><option value="ADMIN">Administrator</option></select></div>
    </fieldset>
    <p role="alert" className={styles.error}>{error}</p>
    <div className={styles.actions}><button disabled={pending}>{pending ? "Creating…" : "Create member"}</button><Link href={`/tenants/${tenantId}/members`} prefetch={false}>Cancel</Link></div>
  </form>;
}
export function MemberControls({ tenantId, member, currentMembershipId }: { tenantId: string; member: Member; currentMembershipId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState(member.role);
  const [active, setActive] = useState(member.isActive);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const result = updateMemberSchema.safeParse({ version: member.version, role, isActive: active });
    if (!result.success) { setError("Invalid member settings."); return; }
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/members/${member.id}`, {
        method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.data),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Unable to update this member."); return; }
      if (member.id === currentMembershipId && (!body.member.isActive || body.member.role !== "ADMIN")) router.replace("/dashboard");
      else {
        const location = new URL(window.location.href);
        location.searchParams.delete("created"); location.searchParams.set("updated", "1");
        router.replace(location.pathname + location.search); router.refresh();
      }
    } catch { setError("Unable to reach the server. Reload before retrying."); }
    finally { setPending(false); }
  }
  return <form aria-label={`Manage ${member.user.email}`} onSubmit={submit} aria-busy={pending}>
    <fieldset className={styles.fields} disabled={pending}><legend className="sr-only">Member access settings</legend>
      <div className={styles.field}><label htmlFor={`role-${member.id}`}>Role</label><select id={`role-${member.id}`} value={role} onChange={event => setRole(event.target.value as Member["role"])}><option value="EMPLOYEE">Employee</option><option value="ADMIN">Administrator</option></select></div>
      <label><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Active company access</label>
    </fieldset>
    <p role="alert" className={styles.error}>{error}</p>
    <div className={styles.actions}><button disabled={pending}>{pending ? "Saving…" : "Save member"}</button><button type="button" disabled={pending} onClick={() => { setRole(member.role); setActive(member.isActive); setError(""); router.refresh(); }}>Reload members</button></div>
  </form>;
}
