import assert from "node:assert/strict";
import test from "node:test";
import { createMemberSchema, updateMemberSchema } from "../../src/lib/validation/member";
const valid = { name: "Alice", email: "alice@example.test", password: "Long-test-password-2026!", role: "EMPLOYEE" };
test("member creation normalizes names and email without altering the password", () => {
  const result = createMemberSchema.parse({ ...valid, name: " Alice ", email: " ALICE@example.test ", password: " Long-test-password " });
  assert.equal(result.name, "Alice"); assert.equal(result.email, "alice@example.test"); assert.equal(result.password, " Long-test-password ");
});
test("member creation rejects weak credentials and supplied ownership", () => {
  for (const input of [{...valid,password:"short"}, {...valid,email:"invalid"}, {...valid,name:" "}, {...valid,role:"OWNER"}, {...valid,tenantId:"other"}, {...valid,isActive:false}]) assert.equal(createMemberSchema.safeParse(input).success,false);
});
test("member updates require an exact version and explicit role/status", () => {
  const validUpdate = {version:1,role:"ADMIN",isActive:true};
  assert.equal(updateMemberSchema.safeParse(validUpdate).success,true);
  for(const input of [{...validUpdate,version:0},{...validUpdate,version:1.5},{...validUpdate,isActive:"false"},{...validUpdate,userId:"other"},{role:"ADMIN",isActive:true}]) assert.equal(updateMemberSchema.safeParse(input).success,false);
});
