import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { demoRegistrationEnabled } from "@/lib/demo-config";
import { SignUpForm } from "./sign-up-form";
import styles from "../sign-in/page.module.css";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  if (!demoRegistrationEnabled()) notFound();
  if (await auth.api.getSession({ headers: await headers() })) redirect("/dashboard");
  return <main className={styles.container}>
    <h1>Try Mini ERP</h1>
    <p>Create your private demo workspace with fictional customers, products and stock. Access lasts 24 hours; expired demo data and accounts are removed by scheduled cleanup.</p>
    <p>Use fictional business data only. Up to 100 customers, products and orders each; inviting members is unavailable.</p>
    <SignUpForm />
    <p>Already registered? <Link href="/sign-in">Sign in</Link></p>
  </main>;
}
