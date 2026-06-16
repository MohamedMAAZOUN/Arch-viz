// ============================================================================
// Sync access — the #61 role check, reused for the WebSocket handshake (#65)
// ============================================================================
// The same pure authorization that gates the REST routes gates a multiplayer
// connection: resolve the (verified, internal) user's role on the project, deny
// if they can't even view, and mark the connection read-only when they can't
// edit. `viewer` => read-only sync, server-enforced (not a UI courtesy).
// ============================================================================

import { can, resolveProjectRole, type ProjectRole } from "../projects/authorization";

import type { Repository } from "../db/repository";

export interface SyncAccess {
  readonly role: ProjectRole;
  readonly canEdit: boolean;
}

/** Resolve a user's access to a project room, or null if they can't view it. */
export async function resolveSyncAccess(
  repo: Repository,
  userId: string,
  projectId: string,
): Promise<SyncAccess | null> {
  const project = await repo.projects.findById(projectId);
  if (!project) return null;
  const membership = await repo.projectMembers.find(projectId, userId);
  const role = resolveProjectRole({ id: userId }, project, membership);
  if (!role || !can(role, "view")) return null;
  return { role, canEdit: can(role, "edit") };
}
