// ============================================================================
// Password hashing — argon2id (ADR 0014, #57)
// ============================================================================
// Wraps @node-rs/argon2 so the algorithm choice lives in exactly one place.
// argon2id is the variant recommended for password storage (hybrid resistance
// to GPU and side-channel attacks). `verify` is constant-time and never throws
// on a malformed hash — it returns false — so a corrupt row can't crash login.
// ============================================================================

import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 defaults to the argon2id variant — the recommended choice for
// password storage. We rely on that default rather than importing the `Algorithm`
// const enum, which cannot be referenced under verbatimModuleSyntax. The unit
// test asserts the produced hash is `$argon2id$…` so a default change is caught.

export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    // A malformed/unsupported hash is an authentication failure, not a crash.
    return false;
  }
}
