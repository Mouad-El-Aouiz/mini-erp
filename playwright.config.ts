import { defineConfig, devices } from "@playwright/test";

const databaseURL = process.env.TEST_DATABASE_URL;

if (!databaseURL) {
  throw new Error("TEST_DATABASE_URL is required. Use the dedicated test database.");
}

const database = new URL(databaseURL);
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !["/mini_erp_test", "/mini_erp_ci"].includes(database.pathname)
) {
  throw new Error("Authentication tests require a local test or CI database.");
}

// Override local development settings for both fixtures and the managed server.
process.env.DATABASE_URL = databaseURL;
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3100";
process.env.BETTER_AUTH_SECRET = "test-only-auth-secret-never-use-in-production-2026";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.BETTER_AUTH_URL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node node_modules/next/dist/bin/next start --port 3100 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3100/sign-in",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: databaseURL,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    },
  },
});
