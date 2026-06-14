import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("produces an argon2id PHC hash and verifies the correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(await verifyPassword(hash, "not-the-password")).toBe(false);
  });

  it("returns false (not throw) on a malformed hash", async () => {
    expect(await verifyPassword("not-a-valid-hash", "whatever")).toBe(false);
  });

  it("salts: hashing the same password twice yields different hashes", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });
});
