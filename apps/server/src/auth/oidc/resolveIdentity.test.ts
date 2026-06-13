import { describe, expect, it } from "vitest";

import { resolveOidcIdentity } from "./resolveIdentity";
import { createMemoryRepository } from "../../db/repository";

import type { OidcProfile } from "./claims";
import type { Repository } from "../../db/repository";

const ISSUER = "https://am.example.com";

function deps(repo: Repository, adminEmails: readonly string[] = []) {
  return { repo, adminEmails: new Set(adminEmails), clock: () => new Date("2026-06-13T00:00:00Z") };
}

const profile = (over: Partial<OidcProfile> = {}): OidcProfile => ({
  issuer: ISSUER,
  subject: "sub-1",
  email: "alice@example.com",
  displayName: "Alice",
  ...over,
});

describe("resolveOidcIdentity", () => {
  it("path 3: lazy-creates a user + identity on first login", async () => {
    const repo = createMemoryRepository();
    const user = await resolveOidcIdentity(deps(repo), profile());
    expect(user.email).toBe("alice@example.com");
    expect(await repo.federatedIdentities.findByIssuerSubject(ISSUER, "sub-1")).not.toBeNull();
    expect(user.isAdmin).toBe(false);
  });

  it("path 3: seeds is_admin from the admin email set", async () => {
    const repo = createMemoryRepository();
    const user = await resolveOidcIdentity(deps(repo, ["alice@example.com"]), profile());
    expect(user.isAdmin).toBe(true);
  });

  it("path 1: a repeat login with the same (issuer, sub) returns the same user — no duplicate", async () => {
    const repo = createMemoryRepository();
    const first = await resolveOidcIdentity(deps(repo), profile());
    const second = await resolveOidcIdentity(deps(repo), profile());
    expect(second.id).toBe(first.id);
    expect((await repo.users.findByEmail("alice@example.com"))?.id).toBe(first.id);
  });

  it("path 1: an email change at the IdP (same sub) updates the user, not a duplicate", async () => {
    const repo = createMemoryRepository();
    const first = await resolveOidcIdentity(deps(repo), profile());
    const changed = await resolveOidcIdentity(
      deps(repo),
      profile({ email: "alice.new@example.com", displayName: "Alice New" }),
    );
    expect(changed.id).toBe(first.id);
    expect(changed.email).toBe("alice.new@example.com");
    expect(changed.displayName).toBe("Alice New");
    expect(await repo.users.findByEmail("alice@example.com")).toBeNull();
  });

  it("path 2: an existing email account is linked one-time, not recreated", async () => {
    const repo = createMemoryRepository();
    // Pre-existing local account.
    const local = await repo.users.create({ email: "bob@example.com", displayName: "Bob" });
    await repo.localCredentials.upsert(local.id, "hash");

    const linked = await resolveOidcIdentity(
      deps(repo),
      profile({ subject: "sub-bob", email: "bob@example.com" }),
    );
    expect(linked.id).toBe(local.id);
    const identity = await repo.federatedIdentities.findByIssuerSubject(ISSUER, "sub-bob");
    expect(identity?.userId).toBe(local.id);

    // A second login now takes path 1 and still resolves the same user.
    const again = await resolveOidcIdentity(
      deps(repo),
      profile({ subject: "sub-bob", email: "bob@example.com" }),
    );
    expect(again.id).toBe(local.id);
  });
});
