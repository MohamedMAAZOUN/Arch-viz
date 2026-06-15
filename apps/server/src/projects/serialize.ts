// ============================================================================
// Project route schemas + serializers
// ============================================================================
// The wire shapes for the /projects surface, kept in one place so the CRUD,
// sharing, and snapshot routes share one contract. Timestamps cross the wire as
// ISO strings; the stored document is returned verbatim (it was validated by the
// shared Zod parser on the way in) and re-parses cleanly on the client.
// ============================================================================

import { z } from "zod";

import type { ProjectMemberRow, ProjectRow, SnapshotRow, UserRow } from "../db/schema";

export const ErrorResponse = z.object({ error: z.string() });

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
  isPublic: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function toPublicProject(row: ProjectRow): z.infer<typeof ProjectSchema> {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    isPublic: row.isPublic,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const MemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(["viewer", "editor"]),
  createdAt: z.string(),
});

export function toPublicMember(
  row: ProjectMemberRow,
  user: Pick<UserRow, "email" | "displayName">,
): z.infer<typeof MemberSchema> {
  return {
    userId: row.userId,
    email: user.email,
    displayName: user.displayName,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Snapshot list entry — metadata only (no document body). */
export const SnapshotMetaSchema = z.object({
  version: z.number().int(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});

export function toSnapshotMeta(row: SnapshotRow): z.infer<typeof SnapshotMetaSchema> {
  return {
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
