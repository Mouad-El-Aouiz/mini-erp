import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import pg from "pg";

const docker = process.env.DOCKER_COMMAND ?? (process.platform === "win32" ? "docker.exe" : "docker");
const composeArgs = ["compose", "-p", "mini-erp-container-tests", "-f", "compose.container-test.yaml"];
const databaseURL = "postgresql://mini_erp_test:test_only_password@127.0.0.1:5434/mini_erp_test?schema=public";
const secret = "test-only-auth-secret-never-use-in-production-2026";
const testEnv = { ...process.env, DATABASE_URL: databaseURL, TEST_DATABASE_URL: databaseURL,
  BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: "http://127.0.0.1:3100" };
const pool = new pg.Pool({ connectionString: databaseURL, connectionTimeoutMillis: 5000 });
let started = false;

function compose(args, capture = false) {
  return execFileSync(docker, [...composeArgs, ...args], {
    stdio: capture ? "pipe" : "inherit", encoding: "utf8",
  });
}
function checkImage() {
  const info = JSON.parse(execFileSync(docker, ["image", "inspect", "mini-erp-app:test"], { encoding: "utf8" }))[0];
  assert.equal(info.Config.User, "node");
  assert.ok(!info.Config.Env.some((entry) => /^(DATABASE_URL|BETTER_AUTH_SECRET|BETTER_AUTH_URL)=/.test(entry)));
  for (const service of ["app", "migrations"]) {
    const id = compose(["ps", "--all", "--quiet", service], true).trim();
    const container = JSON.parse(execFileSync(docker, ["inspect", id], { encoding: "utf8" }))[0];
    assert.equal(container.Config.User, "node");
    assert.equal(container.HostConfig.ReadonlyRootfs, true);
    assert.ok(container.HostConfig.CapDrop.includes("ALL"));
    assert.ok(container.HostConfig.SecurityOpt.some((value) => value.startsWith("no-new-privileges")));
    if (service === "migrations") assert.equal(container.State.ExitCode, 0);
  }
  execFileSync(docker, ["run", "--rm", "--entrypoint", "node", "mini-erp-app:test", "-e",
    `const fs = require("node:fs"); if (fs.readdirSync(".").some((path) => path.startsWith(".env"))) throw Error("Environment file in runtime"); for (const path of [".env", ".env.local", ".git", "tests", "scripts", "node_modules/prisma/build/index.js", "node_modules/typescript/bin/tsc"]) { if (fs.existsSync(path)) throw Error("Unexpected runtime file: " + path); }`], { stdio: "inherit" });
  const validSettings = {
    DATABASE_URL: "postgresql://test:test@db:5432/mini_erp_test",
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: "http://127.0.0.1:3100",
  };
  const invalidSettings = [
    {},
    { ...validSettings, DATABASE_URL: "invalid" },
    { ...validSettings, BETTER_AUTH_SECRET: "too-short" },
    { ...validSettings, BETTER_AUTH_SECRET: "build-only-placeholder-secret-never-use-at-runtime" },
    { ...validSettings, BETTER_AUTH_URL: "http://127.0.0.1:3100/unexpected-path" },
  ];
  for (const settings of invalidSettings) {
    const envArgs = Object.entries(settings).flatMap(([name, value]) => ["-e", `${name}=${value}`]);
    const result = spawnSync(docker, ["run", "--rm", ...envArgs, "mini-erp-app:test"], { encoding: "utf8" });
    assert.equal(result.status, 1, "Invalid runtime settings must prevent startup");
    assert.match(result.stderr, /DATABASE_URL|BETTER_AUTH_SECRET|BETTER_AUTH_URL/);
  }
  console.log("PASS: non-root runtime, no baked-in credentials or CLI tooling, startup guards");
}
async function waitHealth(expected) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3100/api/health", { signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      if (response.status === expected) {
        assert.deepEqual(body, { status: expected === 200 ? "ok" : "unavailable" });
        assert.equal(response.headers.get("cache-control"), "no-store");
        return;
      }
    } catch { /* The server may still be recovering. */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Readiness did not return ${expected} within 60 seconds`);
}

try {
  // Refuse to take ownership of a test project already running in another terminal.
  assert.equal(compose(["ps", "--all", "--quiet"], true).trim(), "", "Stop the existing container test project first");
  started = true;
  compose(["up", "--build", "-d", "--wait", "--wait-timeout", "120"]);
  checkImage();
  await waitHealth(200);
  const expectedMigrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
  const migrationCount = await pool.query('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  assert.equal(migrationCount.rows[0].count, expectedMigrations);
  compose(["run", "--rm", "--no-deps", "migrations"]);
  console.log(`PASS: ${expectedMigrations} migrations applied and deployment replay is harmless`);
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "generate"], { env: testEnv, stdio: "inherit" });
  execFileSync(process.execPath, ["--import", "tsx", "--test", "tests/integration/staging-setup.test.ts"], { env: testEnv, stdio: "inherit" });
  const smoke = [
    "sign-in persists and sign-out",
    "employees can create and edit customers",
    "administrators create and edit exact USD prices",
    "administrators record receipts and corrections",
    "employees confirm through the mobile interface",
    "employees record a complete mobile delivery",
    "administrators cancel complete mobile orders",
    "competing cancellation retries and delivery",
  ].join("|");
  const args = ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.container.config.ts"];
  if (!process.argv.includes("--full")) args.push("--grep", smoke);
  execFileSync(process.execPath, args, { env: testEnv, stdio: "inherit" });

  const marker = randomUUID();
  await pool.query("INSERT INTO tenants (id, name, updated_at) VALUES ($1, 'Container persistence check', CURRENT_TIMESTAMP)", [marker]);
  // Close fixture connections before replacing the database container.
  await pool.end();
  compose(["stop", "db"]);
  await waitHealth(503);
  compose(["up", "-d", "--wait", "--wait-timeout", "60", "--force-recreate", "db"]);
  await waitHealth(200);
  const recovered = new pg.Pool({ connectionString: databaseURL, connectionTimeoutMillis: 5000 });
  try {
    const result = await recovered.query("SELECT count(*)::int AS count FROM tenants WHERE id=$1", [marker]);
    assert.equal(result.rows[0].count, 1);
    await recovered.query("DELETE FROM tenants WHERE id=$1", [marker]);
  } finally {
    await recovered.end();
  }
  console.log("PASS: database outage returns generic 503, readiness recovers, named-volume data survives container replacement");
  compose(["restart", "app"]);
  await waitHealth(200);
  console.log("PASS: application restarts successfully with a read-only filesystem");
} catch (error) {
  if (started) compose(["logs", "--tail", "80"]);
  console.error(error instanceof Error ? error.message : "Container verification failed.");
  process.exitCode = 1;
} finally {
  if (!pool.ended) await pool.end();
  // Only the dedicated project is disposable; the mini-erp development volume is never targeted.
  if (started) compose(["down", "--volumes", "--remove-orphans"]);
}
