// The user shape returned to the browser. Never includes credential material,
// session tokens, or internal-only columns.

import { z } from "zod";

import type { UserRow } from "../db/schema";

export const PublicUser = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  isAdmin: z.boolean(),
  status: z.enum(["active", "disabled", "blocked"]),
});
export type PublicUser = z.infer<typeof PublicUser>;

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    isAdmin: row.isAdmin,
    status: row.status,
  };
}
