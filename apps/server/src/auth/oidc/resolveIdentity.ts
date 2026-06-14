// ============================================================================
// OIDC identity resolution (#58, ADR 0014 "Grafana-informed")
// ============================================================================
// The three-path lookup that turns a verified OIDC profile into an internal
// `users` row. Order matters:
//
//   1. (issuer, sub) already linked → THE stable identifier. Refresh the
//      mutable profile (email/display name) so an email change at the IdP
//      updates the existing user instead of forking a duplicate.
//   2. else email matches an existing account → ONE-TIME link (attach a
//      federated_identities row). This is what bridges local ↔ SSO.
//   3. else lazy-create user + identity in a single transaction. First login
//      is provisioning.
//
// `is_admin` is seeded from the configured admin email set on creation. The
// caller enforces `blocked` (a blocked user is rejected even here) and stamps
// last_login_at — this function only resolves identity.
// ============================================================================

import type { OidcProfile } from "./claims";
import type { Repository } from "../../db/repository";
import type { UserRow } from "../../db/schema";
import type { Clock } from "../clock";

export interface ResolveIdentityDeps {
  readonly repo: Repository;
  readonly adminEmails: ReadonlySet<string>;
  readonly clock: Clock;
}

export async function resolveOidcIdentity(
  deps: ResolveIdentityDeps,
  profile: OidcProfile,
): Promise<UserRow> {
  const { repo } = deps;

  // 1. Existing federated identity → refresh mutable profile fields.
  const identity = await repo.federatedIdentities.findByIssuerSubject(
    profile.issuer,
    profile.subject,
  );
  if (identity) {
    const user = await repo.users.findById(identity.userId);
    if (!user) {
      // A federated identity must always point at a user — DB FK guarantees it.
      throw new Error(
        `federated identity ${identity.id} references missing user ${identity.userId}`,
      );
    }
    if (user.email !== profile.email || user.displayName !== profile.displayName) {
      const updated = await repo.users.updateProfile(user.id, {
        email: profile.email,
        displayName: profile.displayName,
      });
      return updated ?? user;
    }
    return user;
  }

  // 2. Pre-existing account with the same email → one-time link.
  const byEmail = await repo.users.findByEmail(profile.email);
  if (byEmail) {
    await repo.federatedIdentities.create({
      userId: byEmail.id,
      issuer: profile.issuer,
      subject: profile.subject,
    });
    return byEmail;
  }

  // 3. Lazy-create user + identity atomically.
  const { user } = await repo.createUserWithIdentity({
    email: profile.email,
    displayName: profile.displayName,
    isAdmin: deps.adminEmails.has(profile.email),
    issuer: profile.issuer,
    subject: profile.subject,
  });
  return user;
}
