// ============================================================================
// /projects surface — composition root (#60, #61, #62)
// ============================================================================
// Mounts the catalog API under a single scope: CRUD, sharing, and snapshot
// history. The scope installs the CSRF origin guard (same defence the /auth
// scope uses) so a cross-origin mutation carrying the cookie is rejected before
// any handler runs. Authorization itself lives per-route in `authorizeProject`,
// which keeps guest reads working while gating writes.
// ============================================================================

import { registerMemberRoutes } from "./memberRoutes";
import { registerProjectCrud } from "./projectRoutes";
import { registerSnapshotRoutes } from "./snapshotRoutes";
import { addOriginGuard } from "../http/csrf";

import type { AuthContext } from "../auth/types";
import type { FastifyInstance } from "fastify";

export async function registerProjects(app: FastifyInstance, ctx: AuthContext): Promise<void> {
  await app.register(
    (scope, _opts, done) => {
      addOriginGuard(scope, ctx.config.security.allowedOrigins);
      registerProjectCrud(scope, ctx);
      registerMemberRoutes(scope, ctx);
      registerSnapshotRoutes(scope, ctx);
      done();
    },
    { prefix: "/projects" },
  );
}
