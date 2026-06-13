// ============================================================================
// Drizzle table definitions
// ============================================================================
// The full schema v1 (users, sessions, projects, snapshots, …) lands with
// issue #56. This scaffold ships one deliberately tiny table so the migration
// pipeline (drizzle-kit generate → migrate) is proven end to end; it stays
// useful afterwards as a place for instance-level markers (e.g. the applied
// data-schema version).
// ============================================================================

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
