import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword, verifyPassword } from "better-auth/crypto";

const database = new Pool({ connectionString: process.env.DATABASE_URL });
const userId = randomUUID();
const email = `auth-${userId}@example.test`;
const password = "Test-only-password-2026!";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  async function submit() {
    const response = page.waitForResponse((candidate) =>
      candidate.url().endsWith("/api/auth/sign-in/email") &&
      candidate.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    return response;
  }

  let response = await submit();
  if (response.status() === 429) {
    // All browser contexts share localhost. Honor the real production limiter
    // rather than disabling it or introducing an arbitrary fixed delay.
    const retryAfter = Number(response.headers()["x-retry-after"] ?? response.headers()["retry-after"]);
    expect(Number.isFinite(retryAfter) && retryAfter >= 0 && retryAfter <= 10).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
    response = await submit();
  }
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeAll(async () => {
  const passwordHash = await hashPassword(password);
  const connection = await database.connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      'INSERT INTO "user" (id, name, email, "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [userId, "Authentication Test User", email],
    );
    await connection.query(
      'INSERT INTO account (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [randomUUID(), userId, "credential", userId, passwordHash],
    );
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
});

test.afterAll(async () => {
  try {
    await database.query('DELETE FROM "user" WHERE id = $1', [userId]);
  } finally {
    await database.end();
  }
});

test("anonymous visitors cannot access the dashboard", async ({ page, request }) => {
  const response = await request.get("/api/auth/get-session");
  expect(response.status()).toBe(200);
  expect(await response.json()).toBeNull();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in to Mini ERP" })).toBeVisible();
});

test("invalid credentials show the same generic error", async ({ page }) => {
  await page.goto("/sign-in");
  for (const attemptedEmail of [email, `missing-${userId}@example.test`]) {
    await page.getByLabel("Email", { exact: true }).fill(attemptedEmail);
    await page.getByLabel("Password", { exact: true }).fill("Incorrect-password-2026!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Unable to sign in. Check your email and password.",
    );
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});

test("sign-in persists and sign-out invalidates the original session", async ({ page, request }) => {
  await signIn(page);
  await expect(page.getByText("Welcome, Authentication Test User.")).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/dashboard$/);

  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name.endsWith("session_token"));
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie!.httpOnly).toBe(true);
  const originalCookie = `${sessionCookie!.name}=${sessionCookie!.value}`;
  const activeSession = await request.get("/api/auth/get-session", {
    headers: { Cookie: originalCookie },
  });
  expect((await activeSession.json()).user.id).toBe(userId);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);

  const revokedSession = await request.get("/api/auth/get-session", {
    headers: { Cookie: originalCookie },
  });
  expect(await revokedSession.json()).toBeNull();
  const dashboard = await request.get("/dashboard", {
    headers: { Cookie: originalCookie },
    maxRedirects: 0,
  });
  expect(dashboard.status()).toBe(307);
  expect(dashboard.headers().location).toBe("/sign-in");
  const remainingSessions = await database.query(
    'SELECT id FROM session WHERE "userId" = $1', [userId],
  );
  expect(remainingSessions.rowCount).toBe(0);
});

test("expired sessions cannot access the dashboard", async ({ page }) => {
  await signIn(page);
  await database.query(
    `UPDATE session SET "expiresAt" = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE "userId" = $1`,
    [userId],
  );
  await page.reload();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("public registration is disabled", async ({ request }) => {
  const attemptedEmail = `signup-${userId}@example.test`;
  const response = await request.post("/api/auth/sign-up/email", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { name: "Unexpected User", email: attemptedEmail, password },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
  const createdUsers = await database.query('SELECT id FROM "user" WHERE email = $1', [attemptedEmail]);
  expect(createdUsers.rowCount).toBe(0);
});

test("the credential account stores a verifiable hash instead of plaintext", async () => {
  const result = await database.query<{ password: string }>(
    'SELECT password FROM account WHERE "userId" = $1 AND "providerId" = $2',
    [userId, "credential"],
  );
  expect(result.rowCount).toBe(1);
  const account = result.rows[0];
  expect(account.password).not.toBe(password);
  expect(await verifyPassword({ password, hash: account.password! })).toBe(true);
  expect(await verifyPassword({ password: "Incorrect-password", hash: account.password! })).toBe(false);
});
