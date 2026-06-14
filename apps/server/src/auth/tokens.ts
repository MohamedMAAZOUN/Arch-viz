// ============================================================================
// Opaque session tokens
// ============================================================================
// A session token is 256 bits of CSPRNG randomness, base64url-encoded. The DB
// only ever stores its SHA-256 hash, so a database leak does not yield usable
// tokens. Hash comparison is by constant-length hex string; lookup is by the
// unique `token_hash` column.
// ============================================================================

import { createHash, randomBytes } from "node:crypto";

/** A fresh, unguessable session token (the raw value handed to the cookie). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex of a token — the value persisted in `sessions.token_hash`. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
