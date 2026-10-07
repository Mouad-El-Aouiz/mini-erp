import Link from "next/link";
import styles from "@/app/dashboard/workspace.module.css";

export default function TenantNotFound() {
  return (
    <main className={styles.workspace}>
      <h1>Workspace unavailable</h1>
      <p>This workspace does not exist or you do not have active access.</p>
      <Link href="/dashboard" prefetch={false}>Choose another company</Link>
    </main>
  );
}
