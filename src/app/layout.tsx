import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mini ERP | Business Hardware Management",
  description: "A workspace for B2B hardware customers, products, orders and inventory.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <div id="main-content" tabIndex={-1}>{children}</div>
      </body>
    </html>
  );
}
