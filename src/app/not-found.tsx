import Link from "next/link";
import styles from "./dashboard/workspace.module.css";

export default function NotFound() {
  return (
    <main className={styles.workspace}>
      <h1>Page unavailable</h1>
      <p>This page does not exist or is not available to your account.</p>
      <Link href="/dashboard">Return to companies</Link>
    </main>
  );
}
