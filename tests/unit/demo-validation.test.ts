import assert from "node:assert/strict";
import { test } from "node:test";
import { demoSignupSchema } from "../../src/lib/validation/demo";

const input = { name: "Visitor", email: "visitor@example.test", password: " Demo-password-2026! ", consent: true };
test("demo signup normalizes identity fields without trimming passwords", () => {
  const parsed = demoSignupSchema.parse({ ...input, name: " Visitor ", email: " VISITOR@example.test " });
  assert.equal(parsed.name, "Visitor"); assert.equal(parsed.email, input.email); assert.equal(parsed.password, input.password);
});
test("demo signup rejects missing consent, weak passwords and supplied ownership", () => {
  for (const invalid of [{ ...input, consent: false }, { ...input, password: "short" }, { ...input, password: "x".repeat(129) },
    { ...input, tenantId: "existing-company" }, { ...input, role: "ADMIN" }, { ...input, name: " " }])
    assert.equal(demoSignupSchema.safeParse(invalid).success, false);
});
