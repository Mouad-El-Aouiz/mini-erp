import Link from "next/link";
import styles from "./page.module.css";

const modules = [
  { number: "01", available: true, name: "Customers", description: "Keep business contacts and customer records in one place." },
  { number: "02", available: true, name: "Products", description: "Organize your hardware catalog and tax-exclusive prices." },
  { number: "03", available: false, name: "Orders", description: "Follow each order from draft to complete delivery." },
  { number: "04", available: false, name: "Inventory", description: "Distinguish physical, reserved and available stock." },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <header className={styles.header}>
        <span className={styles.brand}>Mini<span>ERP</span></span>
        <span className={styles.status}>Customer and product management</span>
      </header>
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="welcome-title">
          <p className={styles.eyebrow}>B2B HARDWARE OPERATIONS</p>
          <h1 id="welcome-title">A clearer view of<br />your business.</h1>
          <p className={styles.intro}>One workspace for your customers, products, orders and inventory.</p>
          <p className={styles.notice}>Customer management and the product catalog are available. Orders and inventory are coming next.</p>
        </section>
        <section aria-labelledby="modules-title">
          <div className={styles.sectionHeading}>
            <h2 id="modules-title">Your business workspace</h2>
            <Link href="/sign-in">Sign in</Link>
          </div>
          <ul className={styles.modules}>
            {modules.map((module) => (
              <li key={module.name} className={styles.card}>
                <span className={styles.number}>{module.number}</span>
                <h3>{module.name}</h3>
                <p>{module.description}</p>
                <span className={styles.planned}>{module.available ? "Available" : "Planned"}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>Mini ERP · Built for business hardware sales</span>
        <span>USD · Tax-exclusive pricing</span>
      </footer>
    </div>
  );
}
