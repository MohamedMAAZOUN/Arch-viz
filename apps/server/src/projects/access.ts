// ============================================================================
// Project access resolution — the route-side glue around authorization.ts
// ============================================================================
// Every /projects route begins here: resolve the (optional) session user, load
// the project, compute the role with the pure `resolveProjectRole`, and enforce
// the required capability. Reads work for guests (no cookie) on public projects;
// mutations require an authenticated principal with edit/manage rights.
//
// Failure responses are chosen to avoid leaking existence: a principal with no
// access at all gets 404 (same as a genuinely missing project), an authenticated
// principal who can see but not act gets 403, and a guest who would need an
// account to act gets 401.
// ============================================================================

import { can, resolveProjectRole } from "./authorization";
import { resolveSessionUser } from "../auth/guard";

import type { Capability, ProjectRole } from "./authorization";
import type { AuthContext } from "../auth/types";
import type { ProjectRow, UserRow } from "../db/schema";
import type { FastifyReply, FastifyRequest } from "fastify";

export interface ProjectAccess {
  readonly user: UserRow | null;
  readonly project: ProjectRow;
  readonly role: ProjectRole;
}

/**
 * Resolve and authorize access to a single project. On success returns the
 * principal, the project row, and the effective role. On failure it sends the
 * appropriate status (404/403/401) and returns null — the caller just returns.
 */
export async function authorizeProject(
  ctx: AuthContext,
  req: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  capability: Capability,
): Promise<ProjectAccess | null> {
  const user = await resolveSessionUser(ctx, req, reply);

  const project = await ctx.repo.projects.findById(projectId);
  if (!project) {
    await reply.code(404).send({ error: "not_found" });
    return null;
  }

  const membership = user ? await ctx.repo.projectMembers.find(projectId, user.id) : null;
  const role = resolveProjectRole(user, project, membership);

  if (!role) {
    // No relationship to a private project — indistinguishable from missing.
    await reply.code(404).send({ error: "not_found" });
    return null;
  }
  if (!can(role, capability)) {
    if (!user) {
      await reply.code(401).send({ error: "unauthorized" });
      return null;
    }
    await reply.code(403).send({ error: "forbidden" });
    return null;
  }

  return { user, project, role };
}
