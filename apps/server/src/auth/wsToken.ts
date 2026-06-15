// ============================================================================
// WebSocket handshake token (ADR 0014, #65)
// ============================================================================
// `GET /auth/ws-token` (session-guarded) issues a short-lived (~60s) signed JWT
// carrying the internal userId; Hocuspocus `onAuthenticate` verifies it and
// runs the role check. No IdP involvement — identity is internal by this point,
// so a minimal HS256 token signed with the server secret is sufficient and
// keeps the dependency surface small.
//
// HS256 = base64url(header).base64url(payload).base64url(HMAC-SHA256). The
// signature is compared in constant time; `exp` is enforced on verify.
// ============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

import { err, ok, type Result } from "@arch-vis/schema";

/** Default token lifetime — short enough that interception has little value. */
export const WS_TOKEN_TTL_MS = 60_000;

interface WsTokenClaims {
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
}

const HEADER = encode(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));

function encode(buf: Buffer): string {
  return buf.toString("base64url");
}

function hmac(data: string, secret: string): string {
  return encode(createHmac("sha256", secret).update(data).digest());
}

export interface SignedWsToken {
  readonly token: string;
  readonly expiresInMs: number;
}

/** Mint a signed token for `userId`, expiring `ttlMs` from `now`. */
export function signWsToken(
  userId: string,
  secret: string,
  ttlMs: number = WS_TOKEN_TTL_MS,
  now: number = Date.now(),
): SignedWsToken {
  const claims: WsTokenClaims = {
    sub: userId,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + ttlMs) / 1000),
  };
  const payload = encode(Buffer.from(JSON.stringify(claims)));
  const signingInput = `${HEADER}.${payload}`;
  return { token: `${signingInput}.${hmac(signingInput, secret)}`, expiresInMs: ttlMs };
}

/** Verify signature + expiry; returns the userId or an expected-failure error. */
export function verifyWsToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): Result<{ readonly userId: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) return err("malformed token");
  const [header, payload, signature] = parts as [string, string, string];

  const expected = hmac(`${header}.${payload}`, secret);
  if (!constantTimeEqual(signature, expected)) return err("bad signature");

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return err("malformed payload");
  }
  if (!isClaims(claims)) return err("malformed payload");
  if (Math.floor(now / 1000) >= claims.exp) return err("expired");

  return ok({ userId: claims.sub });
}

function isClaims(value: unknown): value is WsTokenClaims {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return typeof c["sub"] === "string" && typeof c["exp"] === "number" && typeof c["iat"] === "number";
}

/** Length-safe constant-time string compare (avoids leaking via timing). */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
