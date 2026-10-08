import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedOrigin } from "../../src/lib/request-origin";

test("accepts only the configured canonical origin", () => {
  const original = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  try {
    const request = (origin?: string) => new Request("http://localhost:3000/api/test", {
      headers: origin === undefined ? {} : { Origin: origin },
    });
    assert.equal(isTrustedOrigin(request("http://localhost:3000")), true);
    for (const origin of [undefined, "null", "invalid", "http://localhost:4000",
      "https://localhost:3000", "http://localhost:3000/", "http://localhost:3000/path",
      "http://localhost:3000.evil.example", "http://user@localhost:3000"]) {
      assert.equal(isTrustedOrigin(request(origin)), false);
    }
    delete process.env.BETTER_AUTH_URL;
    assert.throws(() => isTrustedOrigin(request()), /BETTER_AUTH_URL is required/);
  } finally {
    if (original === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = original;
  }
});
