// ============================================================================
// In-memory Repository — the test implementation
// ============================================================================
// Behaviour-equivalent to the Drizzle repository: same uniqueness rules (email,
// issuer+subject, token_hash, snapshot project+version), same disabled→active
// self-heal, same append-only snapshots. The auth integration tests run the
// real provider code against this, so no Postgres is needed in CI.
//
// Uniqueness violations throw, exactly as the database constraints would, so a
// caller cannot accidentally rely on a duplicate slipping through in tests.
// ============================================================================

import { randomUUID } from "node:crypto";

import type { CreateUserInput, Repository } from "./types";
import type {
  AuditLogRow,
  FederatedIdentityRow,
  ProjectMemberRow,
  ProjectRow,
  SessionRow,
  SnapshotRow,
  UserRow,
} from "../schema";

export function createMemoryRepository(): Repository {
  const users = new Map<string, UserRow>();
  const credentials = new Map<string, { userId: string; passwordHash: string }>();
  const identities = new Map<string, FederatedIdentityRow>();
  const sessionRows = new Map<string, SessionRow>();
  const auditRows: AuditLogRow[] = [];
  const projectRows = new Map<string, ProjectRow>();
  const memberRows: ProjectMemberRow[] = [];
  const snapshotRows: SnapshotRow[] = [];
  const yjsUpdateRows: { projectId: string; update: Uint8Array; seq: number }[] = [];
  let yjsSeq = 0;

  const findUserByEmail = (email: string): UserRow | null =>
    [...users.values()].find((u) => u.email === email) ?? null;

  function insertUser(input: CreateUserInput): UserRow {
    if (findUserByEmail(input.email)) {
      throw new Error(`users_email_unique violation: ${input.email}`);
    }
    const row: UserRow = {
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      status: input.status ?? "active",
      isAdmin: input.isAdmin ?? false,
      createdAt: new Date(),
      lastLoginAt: null,
    };
    users.set(row.id, row);
    return row;
  }

  function insertIdentity(input: {
    userId: string;
    issuer: string;
    subject: string;
  }): FederatedIdentityRow {
    const clash = [...identities.values()].some(
      (i) => i.issuer === input.issuer && i.subject === input.subject,
    );
    if (clash) {
      throw new Error(`federated_identities_issuer_subject_unique violation`);
    }
    const row: FederatedIdentityRow = {
      id: randomUUID(),
      userId: input.userId,
      issuer: input.issuer,
      subject: input.subject,
      createdAt: new Date(),
    };
    identities.set(row.id, row);
    return row;
  }

  return {
    users: {
      findById: (id) => Promise.resolve(users.get(id) ?? null),
      findByEmail: (email) => Promise.resolve(findUserByEmail(email)),
      create: (input) => Promise.resolve().then(() => insertUser(input)),
      updateProfile: (id, profile) =>
        Promise.resolve().then(() => {
          const row = users.get(id);
          if (!row) return null;
          const existing = findUserByEmail(profile.email);
          if (existing && existing.id !== id) {
            throw new Error(`users_email_unique violation: ${profile.email}`);
          }
          const next: UserRow = { ...row, email: profile.email, displayName: profile.displayName };
          users.set(id, next);
          return next;
        }),
      recordLogin: (id, at) => {
        const row = users.get(id);
        if (!row) return Promise.resolve(null);
        const status = row.status === "disabled" ? "active" : row.status;
        const next: UserRow = { ...row, lastLoginAt: at, status };
        users.set(id, next);
        return Promise.resolve(next);
      },
      setStatus: (id, status) => {
        const row = users.get(id);
        if (row) users.set(id, { ...row, status });
        return Promise.resolve();
      },
      list: () =>
        Promise.resolve(
          [...users.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        ),
    },

    localCredentials: {
      findByUserId: (userId) => Promise.resolve(credentials.get(userId) ?? null),
      upsert: (userId, passwordHash) => {
        credentials.set(userId, { userId, passwordHash });
        return Promise.resolve();
      },
    },

    federatedIdentities: {
      findByIssuerSubject: (issuer, subject) =>
        Promise.resolve(
          [...identities.values()].find((i) => i.issuer === issuer && i.subject === subject) ??
            null,
        ),
      create: (input) => Promise.resolve().then(() => insertIdentity(input)),
    },

    sessions: {
      create: (input) => {
        const row: SessionRow = {
          id: randomUUID(),
          userId: input.userId,
          tokenHash: input.tokenHash,
          createdAt: input.rotatedAt,
          rotatedAt: input.rotatedAt,
          idleExpiresAt: input.idleExpiresAt,
          absoluteExpiresAt: input.absoluteExpiresAt,
        };
        sessionRows.set(row.id, row);
        return Promise.resolve(row);
      },
      findByTokenHash: (tokenHash) =>
        Promise.resolve([...sessionRows.values()].find((s) => s.tokenHash === tokenHash) ?? null),
      rotate: (id, input) => {
        const row = sessionRows.get(id);
        if (row) {
          sessionRows.set(id, {
            ...row,
            tokenHash: input.tokenHash,
            rotatedAt: input.rotatedAt,
            idleExpiresAt: input.idleExpiresAt,
          });
        }
        return Promise.resolve();
      },
      deleteById: (id) => {
        sessionRows.delete(id);
        return Promise.resolve();
      },
      deleteByUserId: (userId) => {
        for (const [id, row] of sessionRows) if (row.userId === userId) sessionRows.delete(id);
        return Promise.resolve();
      },
    },

    auditLog: {
      record: (entry) => {
        const row: AuditLogRow = {
          id: randomUUID(),
          actorId: entry.actorId ?? null,
          action: entry.action,
          target: entry.target ?? null,
          details: entry.details ?? null,
          createdAt: new Date(),
        };
        auditRows.push(row);
        return Promise.resolve(row);
      },
      list: (target) =>
        Promise.resolve(
          [...auditRows]
            .filter((r) => target === undefined || r.target === target)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        ),
    },

    projects: {
      create: (input) => {
        const row: ProjectRow = {
          id: randomUUID(),
          name: input.name,
          ownerId: input.ownerId,
          isPublic: input.isPublic ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        projectRows.set(row.id, row);
        return Promise.resolve(row);
      },
      findById: (id) => Promise.resolve(projectRows.get(id) ?? null),
      listPublic: () => Promise.resolve([...projectRows.values()].filter((p) => p.isPublic)),
      listForUser: (userId) => {
        const memberOf = new Set(
          memberRows.filter((m) => m.userId === userId).map((m) => m.projectId),
        );
        return Promise.resolve(
          [...projectRows.values()].filter((p) => p.ownerId === userId || memberOf.has(p.id)),
        );
      },
      rename: (id, name) => {
        const row = projectRows.get(id);
        if (!row) return Promise.resolve(null);
        const next: ProjectRow = { ...row, name, updatedAt: new Date() };
        projectRows.set(id, next);
        return Promise.resolve(next);
      },
      delete: (id) => {
        projectRows.delete(id);
        for (let i = memberRows.length - 1; i >= 0; i -= 1) {
          if (memberRows[i]?.projectId === id) memberRows.splice(i, 1);
        }
        for (let i = snapshotRows.length - 1; i >= 0; i -= 1) {
          if (snapshotRows[i]?.projectId === id) snapshotRows.splice(i, 1);
        }
        return Promise.resolve();
      },
    },

    projectMembers: {
      add: (input) => {
        if (memberRows.some((m) => m.projectId === input.projectId && m.userId === input.userId)) {
          throw new Error(`project_members_pkey violation`);
        }
        const row: ProjectMemberRow = { ...input, createdAt: new Date() };
        memberRows.push(row);
        return Promise.resolve(row);
      },
      find: (projectId, userId) =>
        Promise.resolve(
          memberRows.find((m) => m.projectId === projectId && m.userId === userId) ?? null,
        ),
      listForProject: (projectId) =>
        Promise.resolve(memberRows.filter((m) => m.projectId === projectId)),
      updateRole: (projectId, userId, role) => {
        const row = memberRows.find((m) => m.projectId === projectId && m.userId === userId);
        if (!row) return Promise.resolve(null);
        row.role = role;
        return Promise.resolve(row);
      },
      remove: (projectId, userId) => {
        const idx = memberRows.findIndex((m) => m.projectId === projectId && m.userId === userId);
        if (idx >= 0) memberRows.splice(idx, 1);
        return Promise.resolve();
      },
    },

    snapshots: {
      append: (input) =>
        Promise.resolve().then(() => {
          const clash = snapshotRows.some(
            (s) => s.projectId === input.projectId && s.version === input.version,
          );
          if (clash) {
            throw new Error(`snapshots_project_version_unique violation`);
          }
          const row: SnapshotRow = {
            id: randomUUID(),
            projectId: input.projectId,
            version: input.version,
            document: input.document,
            createdBy: input.createdBy,
            createdAt: new Date(),
          };
          snapshotRows.push(row);
          return row;
        }),
      latest: (projectId) => {
        const forProject = snapshotRows.filter((s) => s.projectId === projectId);
        if (forProject.length === 0) return Promise.resolve(null);
        return Promise.resolve(forProject.reduce((max, s) => (s.version > max.version ? s : max)));
      },
      getByVersion: (projectId, version) =>
        Promise.resolve(
          snapshotRows.find((s) => s.projectId === projectId && s.version === version) ?? null,
        ),
      list: (projectId) =>
        Promise.resolve(
          snapshotRows
            .filter((s) => s.projectId === projectId)
            .sort((a, b) => a.version - b.version),
        ),
    },

    yjsUpdates: {
      append: (projectId, update) => {
        yjsSeq += 1;
        yjsUpdateRows.push({ projectId, update, seq: yjsSeq });
        return Promise.resolve();
      },
      listForProject: (projectId) =>
        Promise.resolve(
          yjsUpdateRows
            .filter((r) => r.projectId === projectId)
            .sort((a, b) => a.seq - b.seq)
            .map((r) => r.update),
        ),
      count: (projectId) =>
        Promise.resolve(yjsUpdateRows.filter((r) => r.projectId === projectId).length),
      compact: (projectId, merged) => {
        for (let i = yjsUpdateRows.length - 1; i >= 0; i -= 1) {
          if (yjsUpdateRows[i]?.projectId === projectId) yjsUpdateRows.splice(i, 1);
        }
        yjsSeq += 1;
        yjsUpdateRows.push({ projectId, update: merged, seq: yjsSeq });
        return Promise.resolve();
      },
    },

    createUserWithIdentity: (input) =>
      Promise.resolve().then(() => {
        const user = insertUser({
          email: input.email,
          displayName: input.displayName,
          isAdmin: input.isAdmin,
          status: "active",
        });
        const identity = insertIdentity({
          userId: user.id,
          issuer: input.issuer,
          subject: input.subject,
        });
        return { user, identity };
      }),
  };
}
