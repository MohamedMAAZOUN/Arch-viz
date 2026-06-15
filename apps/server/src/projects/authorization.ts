// ============================================================================
// Project authorization — a pure function over (user, project, membership)
// ============================================================================
// Issue #61: minimal viable authorization. The role hierarchy is
// owner > editor > viewer > none, and every project route runs the same check.
// This module is deliberately free of Fastify, the repository, and IO so the
// Hocuspocus `onAuthenticate` hook can reuse it verbatim later (viewer = a
// read-only Yjs connection): given the three rows it already has, it can decide
// access without another round-trip.
//
//   • owner  — created the project: edit + delete + manage members.
//   • editor — invited to mutate: edit (rename, commit snapshots) only.
//   • viewer — read-only. A *public* project grants implicit viewer to everyone,
//              including guests (no user), which is exactly the guest-read path.
//   • none   — a private project the user has no relationship to.
// ============================================================================

import type { MemberRole, ProjectRow, UserRow } from "../db/schema";

/** The effective role a principal holds on a project. `null` = no access. */
export type ProjectRole = "owner" | "editor" | "viewer";

/** The four things a principal might be allowed to do to a project. */
export type Capability = "view" | "edit" | "delete" | "manage";

/** The minimal principal shape — `null` for an unauthenticated guest. */
type Principal = Pick<UserRow, "id"> | null;
/** The minimal project shape the check reads. */
type ProjectShape = Pick<ProjectRow, "ownerId" | "isPublic">;
/** The membership row, if any, linking this principal to this project. */
type Membership = { readonly role: MemberRole } | null;

const RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, owner: 3 };

/**
 * Resolve the effective role. Ownership wins, then an explicit membership, then
 * the implicit public-viewer grant. Returns `null` when there is no access.
 */
export function resolveProjectRole(
  user: Principal,
  project: ProjectShape,
  membership: Membership,
): ProjectRole | null {
  if (user) {
    if (project.ownerId === user.id) return "owner";
    if (membership) return membership.role;
  }
  if (project.isPublic) return "viewer";
  return null;
}

/** True when `role` is permitted to perform `capability`. */
export function can(role: ProjectRole | null, capability: Capability): boolean {
  if (!role) return false;
  switch (capability) {
    case "view":
      return RANK[role] >= RANK.viewer;
    case "edit":
      return RANK[role] >= RANK.editor;
    case "delete":
    case "manage":
      return role === "owner";
  }
}
