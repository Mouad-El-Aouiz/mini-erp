"use client";

import Link from "next/link";
import styles from "./dashboard/workspace.module.css";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className={styles.workspace}>
      <h1>Unable to load this page</h1>
      <p role="alert">
        The page could not be loaded. If you just submitted a change,
        check its current state before submitting again.
      </p>
      <div className={styles.pageActions}>
        <button type="button" onClick={() => retry()}>Try loading again</button>
        <Link href="/dashboard">Return to companies</Link>
      </div>
    </main>
  );
}
