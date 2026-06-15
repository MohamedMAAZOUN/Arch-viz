// ============================================================================
// CSRF origin-guard hook
// ============================================================================
// The Fastify wrapper around `isRequestOriginAllowed` (auth/origin.ts). Every
// scope that mounts state-changing routes — /auth, /projects, /admin — installs
// this onRequest hook so a cross-origin POST that somehow carries the session
// cookie is rejected. Safe methods (GET/HEAD/OPTIONS) always pass, so guest
// reads are unaffected.
// ============================================================================

import { isRequestOriginAllowed } from "../auth/origin";

import type { FastifyInstance } from "fastify";

export function addOriginGuard(scope: FastifyInstance, allowedOrigins: readonly string[]): void {
  scope.addHook("onRequest", async (req, reply) => {
    if (
      !isRequestOriginAllowed({
        method: req.method,
        origin: req.headers.origin,
        referer: req.headers.referer,
        allowedOrigins,
      })
    ) {
      return reply.code(403).send({ error: "origin_not_allowed" });
    }
  });
}
