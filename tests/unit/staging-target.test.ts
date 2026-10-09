import test from "node:test";
import assert from "node:assert/strict";
import { validateStagingTarget, readStagingAdminConfig } from "../../scripts/staging-bootstrap";
const env = {
  STAGING_SETUP_CONFIRM: "mini-erp-staging",
  STAGING_DATABASE_HOST: "ep-test.us-east-2.aws.neon.tech",
  DATABASE_URL: "postgresql://fixture:fixture@ep-test.us-east-2.aws.neon.tech/mini_erp_staging?sslmode=require",
};
test("staging target accepts only the explicitly confirmed direct SSL database", () => {
  assert.equal(new URL(validateStagingTarget(env)).pathname, "/mini_erp_staging");
  for (const values of [
    { STAGING_SETUP_CONFIRM: "" }, { STAGING_DATABASE_HOST: "other.neon.tech" },
    { DATABASE_URL: "postgresql://fixture:fixture@localhost/mini_erp_staging?sslmode=require" },
    { DATABASE_URL: env.DATABASE_URL.replace("mini_erp_staging", "mini_erp") },
    { DATABASE_URL: env.DATABASE_URL.replace("?sslmode=require", "") },
    { DATABASE_URL: env.DATABASE_URL.replace("ep-test.", "ep-test-pooler."), STAGING_DATABASE_HOST: "ep-test-pooler.us-east-2.aws.neon.tech" },
  ]) assert.throws(() => validateStagingTarget({ ...env, ...values }));
});
test("staging administrator configuration normalizes names and rejects incomplete credentials", () => {
  const values = { STAGING_ADMIN_EMAIL: " Admin@Example.test ", STAGING_ADMIN_NAME: " Admin ",
    STAGING_ADMIN_PASSWORD: "Fixture-only-password-2026!", STAGING_TENANT_ID: "78198f69-82f6-4be3-aa63-ddc8e10e7ffd", STAGING_TENANT_NAME: " Demo " };
  assert.equal(readStagingAdminConfig(values).email, "admin@example.test");
  for (const changes of [{ STAGING_ADMIN_PASSWORD: "short" }, { STAGING_TENANT_ID: "invalid" },
    { STAGING_ADMIN_EMAIL: "invalid" }, { STAGING_TENANT_NAME: " " }]) {
    assert.throws(() => readStagingAdminConfig({ ...values, ...changes }));
  }
});
