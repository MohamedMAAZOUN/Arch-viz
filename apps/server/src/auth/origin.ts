// ============================================================================
// CSRF origin check (#57)
// ============================================================================
// Defence-in-depth alongside SameSite=Strict cookies: state-changing requests
// must carry an Origin (or, failing that, a Referer) whose origin is on the
// allow-list. Safe methods (GET/HEAD/OPTIONS) are never blocked. A pure
// predicate so it is trivially testable; the Fastify hook is a thin wrapper.
// ============================================================================

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface OriginCheckInput {
  readonly method: string;
  readonly origin?: string | undefined;
  readonly referer?: string | undefined;
  readonly allowedOrigins: readonly string[];
}

/** Normalise a URL or origin string to its canonical origin, or undefined. */
function toOrigin(value: string | undefined): string | undefined {
  if (!value || value === "null") return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/** True when the request passes the CSRF origin check. */
export function isRequestOriginAllowed(input: OriginCheckInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;

  const candidate = toOrigin(input.origin) ?? toOrigin(input.referer);
  if (!candidate) return false; // unsafe method with no provable origin → reject

  const allowed = new Set(input.allowedOrigins.map(toOrigin).filter((o): o is string => !!o));
  return allowed.has(candidate);
}
