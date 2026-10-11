import { randomUUID } from "node:crypto";
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword, verifyPassword } from "better-auth/crypto";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const id = randomUUID();
const email = `password-${id}@example.test`;
const password = "Original-password-2026!";
const changed = "  Changed-password-2026!  ";
const origin = "http://127.0.0.1:3100";

async function signIn(page: Page, value = password) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(value);
  for (let attempt = 0; attempt < 2; attempt++) {
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/sign-in/email") &&
      response.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const response = await responsePromise;
    if (response.status() !== 429) {
      expect(response.status()).toBe(200);
      await expect(page).toHaveURL(/\/dashboard$/);
      return;
    }
    const delay = Number(response.headers()["retry-after"] ??
      response.headers()["x-retry-after"]);
    expect(Number.isFinite(delay) && delay >= 0 && delay <= 10).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, (delay + 1) * 1000));
  }
  throw new Error("Sign-in remained rate limited.");
}

async function cookie(page: Page) {
  const session = (await page.context().cookies()).find((value) =>
    value.name.endsWith("session_token"));
  expect(session).toBeDefined();
  return `${session!.name}=${session!.value}`;
}

async function changePassword(request: APIRequestContext, session: string, value: string, requestOrigin = origin) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request.post("/api/auth/change-password", {
      headers: { Cookie: session, Origin: requestOrigin },
      data: { currentPassword: password, newPassword: value, revokeOtherSessions: true },
    });
    if (response.status() !== 429) return response;
    const delay = Number(response.headers()["retry-after"] ?? response.headers()["x-retry-after"]);
    expect(Number.isFinite(delay) && delay >= 0 && delay <= 10).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, (delay + 1) * 1000));
  }
  throw new Error("Password change remained rate limited.");
}
test.beforeAll(async () => {
  await db.query('INSERT INTO "user" (id, name, email, "updatedAt") VALUES ($1,$2,$3,NOW())',
    [id, "Password Test User", email]);
  await db.query('INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
    [randomUUID(), id, "credential", id, await hashPassword(password)]);
});
test.beforeEach(async () => {
  await db.query('DELETE FROM session WHERE "userId" = $1', [id]);
  await db.query('UPDATE account SET password = $1 WHERE "userId" = $2',
    [await hashPassword(password), id]);
});
test.afterAll(async () => {
  try { await db.query('DELETE FROM "user" WHERE id = $1', [id]); }
  finally { await db.end(); }
});

test("anonymous visitors cannot open account settings or change credentials", async ({ page, request }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in$/);
  const response = await request.post("/api/auth/change-password", {
    headers: { Origin: origin },
    data: { currentPassword: password, newPassword: changed, revokeOtherSessions: true },
  });
  expect(response.status()).toBe(401);
});

test("confirmation and unchanged passwords are rejected before a request", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Account settings" }).click();
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/auth/change-password")) requests++;
  });
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByLabel("New password", { exact: true }).fill(changed);
  await page.getByLabel("Confirm new password").fill("Different-password-2026!");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("The new passwords do not match.");
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(password);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Choose a password different from your current password.");
  expect(requests).toBe(0);
});

test("wrong current password leaves the hash and session unchanged", async ({ page, request }) => {
  await signIn(page);
  const original = await cookie(page);
  const before = await db.query('SELECT password FROM account WHERE "userId"=$1', [id]);
  await page.goto("/account");
  await page.getByLabel("Current password", { exact: true }).fill("Wrong-password-2026!");
  await page.getByLabel("New password", { exact: true }).fill(changed);
  await page.getByLabel("Confirm new password").fill(changed);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Unable to change your password.");
  const after = await db.query('SELECT password FROM account WHERE "userId"=$1', [id]);
  expect(after.rows[0].password).toBe(before.rows[0].password);
  const response = await request.get("/api/auth/get-session", { headers: { Cookie: original } });
  expect((await response.json()).user.id).toBe(id);
});

test("API enforces password length and trusted origin without changing credentials", async ({ page, request }) => {
  await signIn(page);
  const session = await cookie(page);
  const before = await db.query('SELECT password FROM account WHERE "userId"=$1', [id]);
  for (const value of ["short", "a".repeat(129)]) {
    const response = await changePassword(request, session, value);
    expect(response.status()).toBe(400);
  }
  const forbidden = await changePassword(request, session, changed, "https://untrusted.example");
  expect(forbidden.status()).toBe(403);
  const after = await db.query('SELECT password FROM account WHERE "userId"=$1', [id]);
  expect(after.rows[0].password).toBe(before.rows[0].password);
});

test("browser change rotates the current session, revokes other sessions and preserves password spaces", async ({ page, browser, request }) => {
  await signIn(page);
  const original = await cookie(page);
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await signIn(otherPage);
    const otherCookie = await cookie(otherPage);
    await page.goto("/account");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByLabel("Current password", { exact: true }).fill(password);
    await page.getByLabel("New password", { exact: true }).fill(changed);
    await page.getByLabel("Confirm new password").fill(changed);
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText("Password changed successfully.");
    await expect(page.getByLabel("New password", { exact: true })).toHaveValue("");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const fresh = await cookie(page);
    expect(fresh).not.toBe(original);
    for (const stale of [original, otherCookie]) {
      const response = await request.get("/api/auth/get-session", { headers: { Cookie: stale } });
      expect(await response.json()).toBeNull();
    }
    await otherPage.goto("/account");
    await expect(otherPage).toHaveURL(/\/sign-in$/);
    await page.reload();
    await expect(page).toHaveURL(/\/account$/);
    const stored = await db.query('SELECT password FROM account WHERE "userId"=$1', [id]);
    expect(stored.rows[0].password).not.toBe(changed);
    expect(await verifyPassword({ hash: stored.rows[0].password, password: changed })).toBe(true);
    expect(await verifyPassword({ hash: stored.rows[0].password, password: changed.trim() })).toBe(false);
    const rejected = await request.post("/api/auth/sign-in/email", {
      headers: { Origin: origin }, data: { email, password },
    });
    expect(rejected.status()).toBe(401);
    await page.context().clearCookies();
    await signIn(page, changed);
  } finally { await other.close(); }
});
