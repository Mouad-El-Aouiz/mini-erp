"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import styles from "../sign-in/page.module.css";

export function SignUpForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    if (password !== data.get("confirmation")) { setError("Passwords do not match."); return; }
    setError(""); setPending(true);
    try {
      const response = await fetch("/api/demo/sign-up", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password, consent: data.get("consent") === "on" }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Unable to create the demo."); return; }
      form.reset(); setCreated(true);
    } catch { setError("The response could not be confirmed. Try signing in before registering again."); }
    finally { setPending(false); }
  }
  if (created) return <div role="status"><p>Your demo account is ready.</p><Link href="/sign-in">Sign in to your demo</Link></div>;
  return <form onSubmit={submit} aria-busy={pending}>
    <fieldset className={styles.fields} disabled={pending}>
      <legend className={styles.legend}>Demo account</legend>
      <label htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" required maxLength={100} />
      <label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      <label htmlFor="confirmation">Confirm password</label><input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      <label><input type="checkbox" name="consent" required style={{ width: "auto" }} /> I agree to use fictional business data only and understand that this demo expires after 24 hours.</label>
      <button type="submit">{pending ? "Creating demo…" : "Create demo account"}</button>
    </fieldset>
    <p role="alert" className={styles.error}>{error}</p>
  </form>;
}
