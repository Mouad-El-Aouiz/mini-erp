import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PasswordForm } from "./password-form";
import styles from "./page.module.css";

export default async function AccountPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/sign-in");

  return (
    <main className={styles.page}>
      <Link href="/dashboard">Back to companies</Link>

      <h1>Account settings</h1>
      <p>Signed in as {session.user.email}.</p>

      <section aria-labelledby="password-heading">
        <h2 id="password-heading">Change password</h2>
        <p>
          Use 12 to 128 characters. Your other active sessions will be
          signed out after a successful change.
        </p>

        <PasswordForm />
      </section>
    </main>
  );
}