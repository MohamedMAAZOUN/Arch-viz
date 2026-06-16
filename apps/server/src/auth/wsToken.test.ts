import { describe, expect, it } from "vitest";

import { signWsToken, verifyWsToken } from "./wsToken";

const SECRET = "test-ws-secret-please-change";

describe("ws token", () => {
  it("round-trips a userId", () => {
    const { token } = signWsToken("user-1", SECRET, 60_000, 1_000_000);
    const result = verifyWsToken(token, SECRET, 1_000_000);
    expect(result).toEqual({ ok: true, value: { userId: "user-1" } });
  });

  it("rejects an expired token", () => {
    const { token } = signWsToken("user-1", SECRET, 60_000, 1_000_000);
    const result = verifyWsToken(token, SECRET, 1_000_000 + 61_000);
    expect(result).toEqual({ ok: false, error: "expired" });
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = signWsToken("user-1", SECRET, 60_000, 1_000_000);
    const result = verifyWsToken(token, "other-secret-value", 1_000_000);
    expect(result).toEqual({ ok: false, error: "bad signature" });
  });

  it("rejects a tampered payload", () => {
    const { token } = signWsToken("user-1", SECRET, 60_000, 1_000_000);
    const parts = token.split(".");
    const header = parts[0] ?? "";
    const signature = parts[2] ?? "";
    const forged = Buffer.from(
      JSON.stringify({ sub: "admin", iat: 1000, exp: 9_999_999 }),
    ).toString("base64url");
    const result = verifyWsToken(`${header}.${forged}.${signature}`, SECRET, 1_000_000);
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed token", () => {
    expect(verifyWsToken("not-a-jwt", SECRET).ok).toBe(false);
  });

  it("reports the configured lifetime", () => {
    expect(signWsToken("u", SECRET, 60_000, 0).expiresInMs).toBe(60_000);
  });
});
