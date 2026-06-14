// ============================================================================
// Session guard (#57)
// ============================================================================
// Resolves the session cookie to a `users` row on every request and enforces
// `status = active` (ADR 0014: blocking/disabling takes effect immediately,
// even on a live cookie). Token rotation decided by the session service is
// applied here by re-setting the cookie. `requireUser` is the preHandler that
// 401s anonymous/invalid requests; `resolveSessionUser` is the shared lookup
// also used by `GET /auth/me`.
// ============================================================================

import { SESSION_COOKIE, sessionCookieOptions } from "./cookies";

import type { AuthContext } from "./types";
import type { UserRow } from "../db/schema";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Resolve the request's session cookie to an active user, or null. Applies any
 * pending token rotation to the reply and clears a dead cookie.
 */
export async function resolveSessionUser(
  ctx: AuthContext,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<UserRow | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;

  const resolution = await ctx.sessions.resolve(token);
  if (resolution.status === "invalid") {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return null;
  }

  const user = await ctx.repo.users.findById(resolution.userId);
  if (!user || user.status !== "active") {
    // Valid session but the account is gone, disabled, or blocked → revoke now.
    await ctx.sessions.revoke(token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return null;
  }

  if (resolution.rotatedToken) {
    reply.setCookie(
      SESSION_COOKIE,
      resolution.rotatedToken,
      sessionCookieOptions(ctx.config.session),
    );
  }
  return user;
}

/**
 * Mint a fresh session for a user and set the session cookie on the reply.
 * Shared by local login/register and the OIDC callback — one internal session
 * contract regardless of how the user authenticated (ADR 0014).
 */
export async function issueSession(
  ctx: AuthContext,
  reply: FastifyReply,
  userId: string,
): Promise<void> {
  const { token } = await ctx.sessions.create(userId);
  reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(ctx.config.session));
}

/** A preHandler that requires an authenticated, active user (else 401). */
export function createSessionGuard(ctx: AuthContext) {
  return async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = await resolveSessionUser(ctx, req, reply);
    if (!user) {
      await reply.code(401).send({ error: "unauthorized" });
      return;
    }
    req.authUser = user;
  };
}
