import { describe, expect, it } from "vitest";

import { mapClaimsToProfile } from "./claims";

describe("mapClaimsToProfile", () => {
  it("maps a full set of claims and lowercases the email", () => {
    const r = mapClaimsToProfile({
      iss: "https://am.example.com",
      sub: "user-123",
      email: "Alice@Example.com",
      name: "Alice Smith",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      issuer: "https://am.example.com",
      subject: "user-123",
      email: "alice@example.com",
      displayName: "Alice Smith",
    });
  });

  it("falls back through preferred_username then given/family name then email local part", () => {
    const username = mapClaimsToProfile({
      iss: "i",
      sub: "s",
      email: "a@b.com",
      preferred_username: "alice",
    });
    expect(username.ok && username.value.displayName).toBe("alice");

    const fullName = mapClaimsToProfile({
      iss: "i",
      sub: "s",
      email: "a@b.com",
      given_name: "Al",
      family_name: "Ice",
    });
    expect(fullName.ok && fullName.value.displayName).toBe("Al Ice");

    const localPart = mapClaimsToProfile({ iss: "i", sub: "s", email: "carol@b.com" });
    expect(localPart.ok && localPart.value.displayName).toBe("carol");
  });

  it("rejects a token with no email claim", () => {
    const r = mapClaimsToProfile({ iss: "i", sub: "s", name: "No Email" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("email");
  });

  it("rejects claims missing iss/sub", () => {
    expect(mapClaimsToProfile({ sub: "s", email: "a@b.com" }).ok).toBe(false);
    expect(mapClaimsToProfile({ iss: "i", email: "a@b.com" }).ok).toBe(false);
  });
});
