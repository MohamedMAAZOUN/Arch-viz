// ============================================================================
// OIDC claims → profile mapping (#58)
// ============================================================================
// One pure, tested function isolates the IdP-specific claim shape from the rest
// of the flow. Email is REQUIRED: our identity model links and provisions by a
// verified email (ADR 0014), and `users.email` is NOT NULL UNIQUE — a token
// without one cannot be turned into a user, so it is rejected here rather than
// failing later at the database.
// ============================================================================

import { err, ok } from "@arch-vis/schema";
import { z } from "zod";

import type { Result } from "@arch-vis/schema";

const ClaimsSchema = z.object({
  iss: z.string().min(1),
  sub: z.string().min(1),
  email: z.email().optional(),
  name: z.string().optional(),
  preferred_username: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
});

export interface OidcProfile {
  readonly issuer: string;
  readonly subject: string;
  readonly email: string;
  readonly displayName: string;
}

/** Derive a display name from the richest claim available, else the email local part. */
function deriveDisplayName(c: z.infer<typeof ClaimsSchema>, email: string): string {
  const fullName = [c.given_name, c.family_name].filter(Boolean).join(" ").trim();
  const candidates = [c.name?.trim(), c.preferred_username?.trim(), fullName];
  const picked = candidates.find((s): s is string => !!s && s.length > 0);
  return picked ?? email.split("@")[0] ?? email;
}

export function mapClaimsToProfile(rawClaims: unknown): Result<OidcProfile> {
  const parsed = ClaimsSchema.safeParse(rawClaims);
  if (!parsed.success) {
    return err(`invalid id token claims: ${z.prettifyError(parsed.error)}`);
  }
  const c = parsed.data;
  if (!c.email) {
    return err("id token is missing the required 'email' claim");
  }
  const email = c.email.trim().toLowerCase();
  return ok({
    issuer: c.iss,
    subject: c.sub,
    email,
    displayName: deriveDisplayName(c, email),
  });
}
