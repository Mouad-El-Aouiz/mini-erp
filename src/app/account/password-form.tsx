"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import styles from "./page.module.css";

export function PasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) return;

    const form = event.currentTarget;
    const values = new FormData(form);
    const currentPassword = String(values.get("currentPassword") ?? "");
    const newPassword = String(values.get("newPassword") ?? "");
    const confirmation = String(values.get("confirmation") ?? "");

    setError("");
    setSuccess("");

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }

    if (newPassword.length < 12 || newPassword.length > 128) {
      setError("Use a new password containing 12 to 128 characters.");
      return;
    }

    if (newPassword !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("Choose a password different from your current password.");
      return;
    }

    setPending(true);

    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (result.error) {
        setError(
          "Unable to change your password. Check your current password. " +
          "If your session has expired, sign in again.",
        );
        return;
      }

      form.reset();
      setSuccess(
        "Password changed successfully. Your other sessions have been signed out.",
      );
    } catch {
      setError(
        "The result could not be confirmed. " +
        "Before retrying, check whether you can sign in with the new password.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={pending}>
      <fieldset className={styles.fields} disabled={pending}>
        <legend>Password credentials</legend>

        <label htmlFor="current-password">Current password</label>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />

        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />

        <label htmlFor="password-confirmation">Confirm new password</label>
        <input
          id="password-confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />

        <button type="submit">
          {pending ? "Changing password…" : "Change password"}
        </button>
      </fieldset>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
    </form>
  );
}