// ============================================================================
// Drizzle table definitions — database schema v1 (ADR 0014, issue #56)
// ============================================================================
// Identity is deliberately separated from credentials so the two auth modes
// (local password, OIDC) coexist cleanly: a `users` row is the single internal
// identity, and `local_credentials` / `federated_identities` hang off it. A
// user may have either, both, or — after an admin disables their password —
// neither but still SSO.
//
// `snapshots` is append-only: there is no UPDATE/DELETE column churn here, and
// the repository module (../repository) exposes no mutation path for it. The
// `(project_id, version)` unique constraint makes a double-append a hard error.
//
// Types are exported (`$inferSelect` / `$inferInsert`) for route handlers and
// the repository layer — nothing downstream reaches for the driver.
// ============================================================================

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { ProjectDocument } from "@arch-vis/schema";

// --- shared column helpers --------------------------------------------------

/** `timestamptz NOT NULL DEFAULT now()` — the common audit-trail shape. */
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// --- enums ------------------------------------------------------------------

/** User lifecycle (ADR 0014). `disabled` self-heals on auth; `blocked` does not. */
export const userStatus = pgEnum("user_status", ["active", "disabled", "blocked"]);

/** Project membership roles. Owner is tracked on `projects.owner_id`, not here. */
export const memberRole = pgEnum("member_role", ["viewer", "editor"]);

// --- identity ---------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  status: userStatus("status").notNull().default("active"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: createdAt(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/** Local password credentials. One per user; argon2id PHC string in `password_hash`. */
export const localCredentials = pgTable("local_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Federated (OIDC) identities. `(issuer, subject)` is globally unique — it is
 * the stable IdP identifier the login flow looks up first, so an email change
 * at the IdP updates the linked user rather than creating a duplicate.
 */
export const federatedIdentities = pgTable(
  "federated_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("federated_identities_issuer_subject_unique").on(t.issuer, t.subject),
    index("federated_identities_user_id_idx").on(t.userId),
  ],
);

// --- sessions ---------------------------------------------------------------

/**
 * Opaque rotating sessions. Only the SHA-256 `token_hash` is stored; the raw
 * token lives solely in the httpOnly cookie. Rotation replaces `token_hash`
 * and stamps `rotated_at`, so a rotated-out token no longer resolves (reuse is
 * a miss, i.e. rejected). Both idle and absolute expiries are enforced.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: createdAt(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }).notNull().defaultNow(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

// --- audit ------------------------------------------------------------------

/** Append-only admin/auth audit trail. `actor_id` null = system action. */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  target: text("target"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

// --- projects & sharing -----------------------------------------------------

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

/**
 * Append-only commit history. A snapshot is never updated or deleted; restore
 * loads version N and appends it as a new head (ADR 0014). The document is the
 * shared Zod `ProjectDocument`, stored as jsonb and re-parsed on read.
 */
export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    document: jsonb("document").$type<ProjectDocument>().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [unique("snapshots_project_version_unique").on(t.projectId, t.version)],
);

// --- instance metadata (scaffold marker, kept from #55) ---------------------

export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- inferred row types (the surface route handlers / repos consume) --------

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserStatus = (typeof userStatus.enumValues)[number];

export type LocalCredentialRow = typeof localCredentials.$inferSelect;

export type FederatedIdentityRow = typeof federatedIdentities.$inferSelect;
export type NewFederatedIdentity = typeof federatedIdentities.$inferInsert;

export type SessionRow = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

export type ProjectRow = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type ProjectMemberRow = typeof projectMembers.$inferSelect;
export type MemberRole = (typeof memberRole.enumValues)[number];

export type SnapshotRow = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
