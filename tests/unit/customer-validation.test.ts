import assert from "node:assert/strict";
import test from "node:test";
import { customerSchema, customerPageSchema } from "../../src/lib/validation/customer";

test("trims customer fields and preserves phone formatting", () => {
  const customer = customerSchema.parse({
    companyName: "  Atlas Computers  ",
    contactName: "  Jane Smith  ",
    email: "  jane@example.com  ",
    phone: "  +212 0612 345678  ",
    address: "  10 Business Street  ",
  });

  assert.deepEqual(customer, {
    companyName: "Atlas Computers",
    contactName: "Jane Smith",
    email: "jane@example.com",
    phone: "+212 0612 345678",
    address: "10 Business Street",
  });
});

test("converts omitted, empty and null optional fields to null", () => {
  for (const value of [undefined, "", "   ", null]) {
    const result = customerSchema.parse({
      companyName: "Atlas Computers",
      contactName: value,
      email: value,
      phone: value,
      address: value,
    });

    assert.equal(result.contactName, null);
    assert.equal(result.email, null);
    assert.equal(result.phone, null);
    assert.equal(result.address, null);
  }
});

test("rejects missing or blank company names", () => {
  for (const companyName of [undefined, null, "", "   "]) {
    assert.equal(
      customerSchema.safeParse({ companyName }).success,
      false,
    );
  }
});

test("enforces text length boundaries", () => {
  const limits = {
    companyName: 200,
    contactName: 150,
    phone: 50,
    address: 1000,
  };

  for (const [field, limit] of Object.entries(limits)) {
    assert.equal(
      customerSchema.safeParse({
        companyName: "Atlas Computers",
        [field]: "a".repeat(limit),
      }).success,
      true,
    );

    assert.equal(
      customerSchema.safeParse({
        companyName: "Atlas Computers",
        [field]: "a".repeat(limit + 1),
      }).success,
      false,
    );
  }
});

test("rejects invalid email addresses", () => {
  for (const email of ["invalid", "user@", "@example.com"]) {
    assert.equal(
      customerSchema.safeParse({
        companyName: "Atlas Computers",
        email,
      }).success,
      false,
    );
  }
});

test("rejects unexpected fields supplied by the client", () => {
  for (const field of ["tenantId", "id", "createdAt"]) {
    assert.equal(
      customerSchema.safeParse({
        companyName: "Atlas Computers",
        [field]: "unexpected",
      }).success,
      false,
    );
  }
});

test("rejects incorrect field types", () => {
  for (const field of [
    "companyName",
    "contactName",
    "email",
    "phone",
    "address",
  ]) {
    for (const value of [123, true, [], {}]) {
      assert.equal(
        customerSchema.safeParse({
          companyName: "Atlas Computers",
          [field]: value,
        }).success,
        false,
      );
    }
  }
});

test("enforces the email length boundary", () => {
  const email = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(61);
  assert.equal(email.length, 254);
  assert.equal(customerSchema.safeParse({ companyName: "Atlas", email }).success, true);
  assert.equal(customerSchema.safeParse({ companyName: "Atlas", email: email + "d" }).success, false);
});

test("accepts only bounded positive integer page numbers", () => {
  assert.equal(customerPageSchema.parse(undefined), 1);
  assert.equal(customerPageSchema.parse("20"), 20);
  for (const page of ["", "0", "-1", "1.5", " 1", "10000", ["1", "2"]]) {
    assert.equal(customerPageSchema.safeParse(page).success, false);
  }
});
