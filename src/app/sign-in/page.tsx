import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";
import styles from "./page.module.css";

export default async function SignInPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className={styles.container}>
      <h1>Sign in to Mini ERP</h1>
      <p>Enter your account credentials to continue.</p>
      <SignInForm />
    </main>
  );
}