// ============================================================================
// Session service — the shared session layer (ADR 0014, #57)
// ============================================================================
// Mode-agnostic: both local and OIDC logins mint sessions through `create`,
// and every authenticated request resolves one through `resolve`. The contract:
//
//   • Opaque token → cookie; only its SHA-256 hash is stored.
//   • Idle + absolute lifetimes are both enforced on resolve; an expired
//     session is deleted and rejected.
//   • Token rotation after ~`rotationIntervalMs` of activity replaces the
//     stored hash, so the rotated-out token no longer resolves (reuse is a
//     miss → rejected). Rotation also slides the idle window forward.
//
// All time and randomness come through injected seams, so the rules are tested
// deterministically against the in-memory repository.
// ============================================================================

import { generateSessionToken, hashToken } from "./tokens";

import type { Clock } from "./clock";
import type { SessionsRepo } from "../db/repository";
import type { SessionRow } from "../db/schema";

export interface SessionServiceConfig {
  readonly idleTtlMs: number;
  readonly absoluteTtlMs: number;
  readonly rotationIntervalMs: number;
}

/** Outcome of resolving a cookie token on an incoming request. */
export type SessionResolution =
  | { readonly status: "active"; readonly userId: string; readonly rotatedToken: string | null }
  | { readonly status: "invalid" };

export interface SessionService {
  /** Mint a new session for a user; returns the raw token for the cookie. */
  create(userId: string): Promise<{ token: string; session: SessionRow }>;
  /** Resolve a raw token: validate lifetimes, rotate if due. */
  resolve(token: string): Promise<SessionResolution>;
  /** Revoke a single session by its raw token (logout). */
  revoke(token: string): Promise<void>;
  /** Revoke every session for a user (e.g. on block). */
  revokeAllForUser(userId: string): Promise<void>;
}

export interface SessionServiceDeps {
  readonly sessions: SessionsRepo;
  readonly config: SessionServiceConfig;
  readonly clock: Clock;
  /** Override only in tests; defaults to the CSPRNG token generator. */
  readonly newToken?: () => string;
}

export function createSessionService(deps: SessionServiceDeps): SessionService {
  const { sessions, config, clock } = deps;
  const newToken = deps.newToken ?? generateSessionToken;

  return {
    async create(userId) {
      const token = newToken();
      const now = clock().getTime();
      const session = await sessions.create({
        userId,
        tokenHash: hashToken(token),
        rotatedAt: new Date(now),
        idleExpiresAt: new Date(now + config.idleTtlMs),
        absoluteExpiresAt: new Date(now + config.absoluteTtlMs),
      });
      return { token, session };
    },

    async resolve(token) {
      const row = await sessions.findByTokenHash(hashToken(token));
      if (!row) return { status: "invalid" };

      const now = clock().getTime();
      if (now >= row.absoluteExpiresAt.getTime() || now >= row.idleExpiresAt.getTime()) {
        await sessions.deleteById(row.id);
        return { status: "invalid" };
      }

      // Rotate once the token has been in use longer than the interval.
      if (now - row.rotatedAt.getTime() >= config.rotationIntervalMs) {
        const rotated = newToken();
        await sessions.rotate(row.id, {
          tokenHash: hashToken(rotated),
          rotatedAt: new Date(now),
          idleExpiresAt: new Date(now + config.idleTtlMs),
        });
        return { status: "active", userId: row.userId, rotatedToken: rotated };
      }

      return { status: "active", userId: row.userId, rotatedToken: null };
    },

    async revoke(token) {
      const row = await sessions.findByTokenHash(hashToken(token));
      if (row) await sessions.deleteById(row.id);
    },

    async revokeAllForUser(userId) {
      await sessions.deleteByUserId(userId);
    },
  };
}
