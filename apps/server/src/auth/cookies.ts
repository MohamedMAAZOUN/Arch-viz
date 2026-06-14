// ============================================================================
// Session cookie shape (#57)
// ============================================================================
// One place defines the cookie name and its security attributes: httpOnly (no
// JS access), SameSite=Strict (the primary CSRF defence), Secure in production,
// and an absolute max-age matching the session's absolute lifetime.
// ============================================================================

import type { SessionConfig } from "../config";

export const SESSION_COOKIE = "arch_vis_session";

/** Cookie attributes for an issued/rotated session token. */
export function sessionCookieOptions(session: SessionConfig) {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: session.secureCookies,
    path: "/",
    maxAge: Math.floor(session.absoluteTtlMs / 1000),
  } as const;
}

/** Cookie attributes that immediately expire the session cookie (logout). */
export function clearedSessionCookieOptions(session: SessionConfig) {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: session.secureCookies,
    path: "/",
    maxAge: 0,
  } as const;
}
