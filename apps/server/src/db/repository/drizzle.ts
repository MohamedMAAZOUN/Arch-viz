// ============================================================================
// Drizzle-backed Repository — the production implementation
// ============================================================================
// The only module besides db/ that issues SQL. Everything here mirrors the
// in-memory repository's behaviour so tests written against the latter hold in
// production. Snapshots get an `append` and reads — no update/delete exists.
// ============================================================================

import { and, asc, desc, eq, sql } from "drizzle-orm";

import {
  auditLog,
  federatedIdentities,
  localCredentials,
  projectMembers,
  projects,
  sessions,
  snapshots,
  users,
  yjsUpdates,
} from "../schema";

import type {
  CreateSessionInput,
  CreateUserInput,
  CreateUserWithIdentityInput,
  Repository,
  RotateSessionInput,
  AuditEntryInput,
} from "./types";
import type { AppDb } from "..";

/** Inserts return exactly one row on success; absence is an invariant violation. */
function only<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`expected an inserted ${what} row, got none`);
  return row;
}

export function createDrizzleRepository(db: AppDb): Repository {
  const orm = db.orm;

  return {
    users: {
      async findById(id) {
        const [row] = await orm.select().from(users).where(eq(users.id, id)).limit(1);
        return row ?? null;
      },
      async findByEmail(email) {
        const [row] = await orm.select().from(users).where(eq(users.email, email)).limit(1);
        return row ?? null;
      },
      async create(input: CreateUserInput) {
        const rows = await orm
          .insert(users)
          .values({
            email: input.email,
            displayName: input.displayName,
            isAdmin: input.isAdmin ?? false,
            status: input.status ?? "active",
          })
          .returning();
        return only(rows, "user");
      },
      async updateProfile(id, profile) {
        const [row] = await orm
          .update(users)
          .set({ email: profile.email, displayName: profile.displayName })
          .where(eq(users.id, id))
          .returning();
        return row ?? null;
      },
      async recordLogin(id, at) {
        // Read-modify-write so the disabled→active self-heal stays identical to
        // the in-memory repo; blocked is left untouched (ADR 0014).
        const [current] = await orm.select().from(users).where(eq(users.id, id)).limit(1);
        if (!current) return null;
        const status = current.status === "disabled" ? "active" : current.status;
        const [row] = await orm
          .update(users)
          .set({ lastLoginAt: at, status })
          .where(eq(users.id, id))
          .returning();
        return row ?? null;
      },
      async setStatus(id, status) {
        await orm.update(users).set({ status }).where(eq(users.id, id));
      },
      async list() {
        return orm.select().from(users).orderBy(desc(users.createdAt));
      },
    },

    localCredentials: {
      async findByUserId(userId) {
        const [row] = await orm
          .select()
          .from(localCredentials)
          .where(eq(localCredentials.userId, userId))
          .limit(1);
        return row ? { userId: row.userId, passwordHash: row.passwordHash } : null;
      },
      async upsert(userId, passwordHash) {
        await orm
          .insert(localCredentials)
          .values({ userId, passwordHash })
          .onConflictDoUpdate({
            target: localCredentials.userId,
            set: { passwordHash, updatedAt: new Date() },
          });
      },
    },

    federatedIdentities: {
      async findByIssuerSubject(issuer, subject) {
        const [row] = await orm
          .select()
          .from(federatedIdentities)
          .where(
            and(eq(federatedIdentities.issuer, issuer), eq(federatedIdentities.subject, subject)),
          )
          .limit(1);
        return row ?? null;
      },
      async create(input) {
        const rows = await orm.insert(federatedIdentities).values(input).returning();
        return only(rows, "federated identity");
      },
    },

    sessions: {
      async create(input: CreateSessionInput) {
        const rows = await orm
          .insert(sessions)
          .values({
            userId: input.userId,
            tokenHash: input.tokenHash,
            rotatedAt: input.rotatedAt,
            idleExpiresAt: input.idleExpiresAt,
            absoluteExpiresAt: input.absoluteExpiresAt,
          })
          .returning();
        return only(rows, "session");
      },
      async findByTokenHash(tokenHash) {
        const [row] = await orm
          .select()
          .from(sessions)
          .where(eq(sessions.tokenHash, tokenHash))
          .limit(1);
        return row ?? null;
      },
      async rotate(id, input: RotateSessionInput) {
        await orm
          .update(sessions)
          .set({
            tokenHash: input.tokenHash,
            rotatedAt: input.rotatedAt,
            idleExpiresAt: input.idleExpiresAt,
          })
          .where(eq(sessions.id, id));
      },
      async deleteById(id) {
        await orm.delete(sessions).where(eq(sessions.id, id));
      },
      async deleteByUserId(userId) {
        await orm.delete(sessions).where(eq(sessions.userId, userId));
      },
    },

    auditLog: {
      async record(entry: AuditEntryInput) {
        const rows = await orm
          .insert(auditLog)
          .values({
            actorId: entry.actorId ?? null,
            action: entry.action,
            target: entry.target ?? null,
            details: entry.details ?? null,
          })
          .returning();
        return only(rows, "audit log");
      },
      async list(target) {
        const query = orm.select().from(auditLog);
        const rows = target
          ? await query.where(eq(auditLog.target, target)).orderBy(desc(auditLog.createdAt))
          : await query.orderBy(desc(auditLog.createdAt));
        return rows;
      },
    },

    projects: {
      async create(input) {
        const rows = await orm
          .insert(projects)
          .values({ name: input.name, ownerId: input.ownerId, isPublic: input.isPublic ?? false })
          .returning();
        return only(rows, "project");
      },
      async findById(id) {
        const [row] = await orm.select().from(projects).where(eq(projects.id, id)).limit(1);
        return row ?? null;
      },
      async listPublic() {
        return orm.select().from(projects).where(eq(projects.isPublic, true));
      },
      async listForUser(userId) {
        // Owned projects plus those reached through a membership row. A left-ish
        // union is overkill for the v1 volumes — two reads, de-duped in memory.
        const owned = await orm.select().from(projects).where(eq(projects.ownerId, userId));
        const shared = await orm
          .select({ project: projects })
          .from(projectMembers)
          .innerJoin(projects, eq(projectMembers.projectId, projects.id))
          .where(eq(projectMembers.userId, userId));
        const byId = new Map(owned.map((p) => [p.id, p]));
        for (const { project } of shared) byId.set(project.id, project);
        return [...byId.values()];
      },
      async rename(id, name) {
        const [row] = await orm
          .update(projects)
          .set({ name, updatedAt: new Date() })
          .where(eq(projects.id, id))
          .returning();
        return row ?? null;
      },
      async delete(id) {
        await orm.delete(projects).where(eq(projects.id, id));
      },
    },

    projectMembers: {
      async add(input) {
        const rows = await orm.insert(projectMembers).values(input).returning();
        return only(rows, "project member");
      },
      async find(projectId, userId) {
        const [row] = await orm
          .select()
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
          .limit(1);
        return row ?? null;
      },
      async listForProject(projectId) {
        return orm.select().from(projectMembers).where(eq(projectMembers.projectId, projectId));
      },
      async updateRole(projectId, userId, role) {
        const [row] = await orm
          .update(projectMembers)
          .set({ role })
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
          .returning();
        return row ?? null;
      },
      async remove(projectId, userId) {
        await orm
          .delete(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
      },
    },

    snapshots: {
      async append(input) {
        const rows = await orm
          .insert(snapshots)
          .values({
            projectId: input.projectId,
            version: input.version,
            document: input.document,
            createdBy: input.createdBy,
          })
          .returning();
        return only(rows, "snapshot");
      },
      async latest(projectId) {
        const [row] = await orm
          .select()
          .from(snapshots)
          .where(eq(snapshots.projectId, projectId))
          .orderBy(desc(snapshots.version))
          .limit(1);
        return row ?? null;
      },
      async getByVersion(projectId, version) {
        const [row] = await orm
          .select()
          .from(snapshots)
          .where(and(eq(snapshots.projectId, projectId), eq(snapshots.version, version)))
          .limit(1);
        return row ?? null;
      },
      async list(projectId) {
        return orm
          .select()
          .from(snapshots)
          .where(eq(snapshots.projectId, projectId))
          .orderBy(asc(snapshots.version));
      },
    },

    yjsUpdates: {
      async append(projectId, update) {
        await orm.insert(yjsUpdates).values({ projectId, update });
      },
      async listForProject(projectId) {
        const rows = await orm
          .select({ update: yjsUpdates.update })
          .from(yjsUpdates)
          .where(eq(yjsUpdates.projectId, projectId))
          .orderBy(asc(yjsUpdates.createdAt), asc(yjsUpdates.id));
        return rows.map((r) => r.update);
      },
      async count(projectId) {
        const [row] = await orm
          .select({ n: sql<number>`count(*)::int` })
          .from(yjsUpdates)
          .where(eq(yjsUpdates.projectId, projectId));
        return row?.n ?? 0;
      },
      async compact(projectId, merged) {
        // Atomic swap: drop the log for this project and write one full-state row.
        await orm.transaction(async (tx) => {
          await tx.delete(yjsUpdates).where(eq(yjsUpdates.projectId, projectId));
          await tx.insert(yjsUpdates).values({ projectId, update: merged });
        });
      },
    },

    async createUserWithIdentity(input: CreateUserWithIdentityInput) {
      return orm.transaction(async (tx) => {
        const user = only(
          await tx
            .insert(users)
            .values({
              email: input.email,
              displayName: input.displayName,
              isAdmin: input.isAdmin,
              status: "active",
            })
            .returning(),
          "user",
        );
        const identity = only(
          await tx
            .insert(federatedIdentities)
            .values({ userId: user.id, issuer: input.issuer, subject: input.subject })
            .returning(),
          "federated identity",
        );
        return { user, identity };
      });
    },
  };
}
