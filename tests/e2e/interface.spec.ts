import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const userId = randomUUID(), tenantId = randomUUID();
const email = `interface-${userId}@example.test`;
const password = "Interface-test-password-2026!";
const tenantName = "Company".repeat(28);
const base = `/tenants/${tenantId}`;

async function signIn(page: Page) {
  const submit = () => page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: "http://127.0.0.1:3100" }, data: { email, password },
  });
  let response = await submit();
  if (response.status() === 429) {
    const delay = Number(response.headers()["retry-after"] ?? response.headers()["x-retry-after"]);
    expect(Number.isFinite(delay) && delay >= 0 && delay <= 10).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, (delay + 1) * 1000));
    response = await submit();
  }
  expect(response.status()).toBe(200);
}

test.beforeAll(async () => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query('INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,NOW())',
      [userId, "Interface Test User", email]);
    await client.query('INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
      [randomUUID(), userId, "credential", userId, await hashPassword(password)]);
    await client.query("INSERT INTO tenants (id,name,updated_at) VALUES ($1,$2,NOW())",
      [tenantId, tenantName]);
    await client.query("INSERT INTO memberships (tenant_id,user_id,role,updated_at) VALUES ($1,$2,'ADMIN',NOW())",
      [tenantId, userId]);
    await client.query("INSERT INTO customers (tenant_id,company_name,updated_at) VALUES ($1,$2,NOW())",
      [tenantId, "Customer".repeat(25)]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
test.afterAll(async () => {
  try {
    await db.query("DELETE FROM customers WHERE tenant_id=$1", [tenantId]);
    await db.query("DELETE FROM memberships WHERE tenant_id=$1", [tenantId]);
    await db.query("DELETE FROM tenants WHERE id=$1", [tenantId]);
    await db.query('DELETE FROM "user" WHERE id=$1', [userId]);
  } finally { await db.end(); }
});

test("keyboard users can bypass navigation and reach a visibly focused control", async ({ page }) => {
  await page.goto("/sign-in");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  expect(await page.getByLabel("Email", { exact: true }).evaluate((element) =>
    getComputedStyle(element).outlineStyle)).not.toBe("none");
});

test("unavailable pages offer a recovery path without revealing tenant access", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { name: "Page unavailable" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to companies" })).toHaveAttribute("href", "/dashboard");
  await signIn(page);
  await page.goto(`/tenants/${randomUUID()}`);
  await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
  await expect(page.getByText(tenantName, { exact: true })).toHaveCount(0);
});

for (const width of [320, 375, 1280]) {
  test(`core screens stay within a ${width}px viewport with long company names`, async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width, height: 850 });
    const routes = ["/dashboard", "/account", base, base + "/customers",
      base + "/customers/new", base + "/products", base + "/products/new",
      base + "/inventory", base + "/orders", base + "/orders/new",
      base + "/members", base + "/members/new", base + "/tax-settings"];
    for (const route of routes) {
      await page.goto(route);
      if (width === 375 && route === base) {
        await page.screenshot({ path: "test-results/interface-workspace-mobile.png", fullPage: true });
      }
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth), route).toBe(true);
      const controls = page.getByRole("main").locator('input:not([type="hidden"]), textarea, select');
      for (let index = 0; index < await controls.count(); index++) {
        expect(await controls.nth(index).evaluate((element) => {
          const control = element as HTMLInputElement;
          return Boolean(control.labels?.length || control.getAttribute("aria-label") ||
            control.getAttribute("aria-labelledby"));
        }), `Unlabelled field on ${route}`).toBe(true);
      }
    }
  });
}

test("empty lists explain the next action and customer errors identify the field", async ({ page }) => {
  await signIn(page);
  await page.goto(base + "/products");
  await expect(page.getByRole("heading", { name: "No products yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New product" })).toBeVisible();
  await page.goto(base + "/orders");
  await expect(page.getByText(/No orders/).first()).toBeVisible();
  await page.goto(base + "/customers/new");
  await page.getByRole("button", { name: "Create customer", exact: true }).click();
  const field = page.getByLabel("Company name", { exact: true });
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAttribute("aria-describedby", "companyName-error");
  await expect(page.locator("#companyName-error")).not.toBeEmpty();
});

test("customer picker announces loading, explains failure and supports retry", async ({ page }) => {
  await signIn(page);
  let calls = 0;
  let releaseLoad!: () => void;
  const gate = new Promise<void>((resolve) => { releaseLoad = resolve; });
  await page.route(`**/api/tenants/${tenantId}/customers?page=1`, async (route) => {
    calls++;
    if (calls === 1) {
      await route.fulfill({ status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "Customers are temporarily unavailable." }) });
      return;
    }
    await gate;
    await route.continue();
  });
  await page.goto(base + "/orders/new");
  await expect(page.getByRole("main").getByRole("alert").filter({
    hasText: "Customers are temporarily unavailable." })).toBeVisible();
  await page.getByRole("button", { name: "Retry loading customers" }).click();
  try {
    await expect(page.getByRole("status")).toContainText("Loading...");
    await expect(page.getByLabel("Customer", { exact: true })).toBeDisabled();
  } finally { releaseLoad(); }
  await expect(page.getByLabel("Customer", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Customer", { exact: true }).locator("option")).toHaveCount(2);
});
