// ============================================================================
// Repository interfaces — the server-side one-entry-point boundary (ADR 0014)
// ============================================================================
// Route handlers and auth providers depend on these interfaces, never on the
// Drizzle driver. Two implementations exist: `createDrizzleRepository`
// (./drizzle, production) and `createMemoryRepository` (./memory, tests) — both
// must satisfy the same behaviour, which is exactly what makes the auth flow
// testable without a Postgres. This lives under db/ because it is the SQL
// boundary (the driver may only be imported here and in db/index.ts).
//
// Snapshots are APPEND-ONLY by construction: `SnapshotsRepo` exposes `append`
// and read methods only. There is deliberately no update or delete — history
// is immutable; "restore" appends version N as a new head.
// ============================================================================

import type {
  AuditLogRow,
  FederatedIdentityRow,
  MemberRole,
  ProjectMemberRow,
  ProjectRow,
  SessionRow,
  SnapshotRow,
  UserRow,
  UserStatus,
} from "../schema";
import type { ProjectDocument } from "@arch-vis/schema";

export interface CreateUserInput {
  readonly email: string;
  readonly displayName: string;
  readonly isAdmin?: boolean;
  readonly status?: UserStatus;
}

export interface UsersRepo {
  findById(id: string): Promise<UserRow | null>;
  findByEmail(email: string): Promise<UserRow | null>;
  create(input: CreateUserInput): Promise<UserRow>;
  /** Refresh mutable profile fields from fresh IdP claims. */
  updateProfile(
    id: string,
    profile: { email: string; displayName: string },
  ): Promise<UserRow | null>;
  /**
   * Stamp `last_login_at` and self-heal `disabled → active` (ADR 0014). A
   * `blocked` user is left untouched — successful auth never unblocks.
   * Returns the post-update row.
   */
  recordLogin(id: string, at: Date): Promise<UserRow | null>;
  setStatus(id: string, status: UserStatus): Promise<void>;
}

export interface LocalCredentialsRepo {
  findByUserId(
    userId: string,
  ): Promise<{ readonly userId: string; readonly passwordHash: string } | null>;
  /** Create or replace the password hash for a user. */
  upsert(userId: string, passwordHash: string): Promise<void>;
}

export interface FederatedIdentitiesRepo {
  findByIssuerSubject(issuer: string, subject: string): Promise<FederatedIdentityRow | null>;
  create(input: { userId: string; issuer: string; subject: string }): Promise<FederatedIdentityRow>;
}

export interface CreateSessionInput {
  readonly userId: string;
  readonly tokenHash: string;
  /** Issue time — the session service controls it so rotation logic is clock-driven. */
  readonly rotatedAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

export interface RotateSessionInput {
  readonly tokenHash: string;
  readonly rotatedAt: Date;
  readonly idleExpiresAt: Date;
}

export interface SessionsRepo {
  create(input: CreateSessionInput): Promise<SessionRow>;
  findByTokenHash(tokenHash: string): Promise<SessionRow | null>;
  rotate(id: string, input: RotateSessionInput): Promise<void>;
  deleteById(id: string): Promise<void>;
  /** Revoke every live session for a user (e.g. on block). */
  deleteByUserId(userId: string): Promise<void>;
}

export interface AuditEntryInput {
  readonly actorId?: string | null;
  readonly action: string;
  readonly target?: string | null;
  readonly details?: Record<string, unknown> | null;
}

export interface AuditLogRepo {
  record(entry: AuditEntryInput): Promise<AuditLogRow>;
}

export interface ProjectsRepo {
  create(input: { name: string; ownerId: string; isPublic?: boolean }): Promise<ProjectRow>;
  findById(id: string): Promise<ProjectRow | null>;
  listPublic(): Promise<readonly ProjectRow[]>;
}

export interface ProjectMembersRepo {
  add(input: { projectId: string; userId: string; role: MemberRole }): Promise<ProjectMemberRow>;
  find(projectId: string, userId: string): Promise<ProjectMemberRow | null>;
  listForProject(projectId: string): Promise<readonly ProjectMemberRow[]>;
}

/** Append-only. No update, no delete — by design (ADR 0014). */
export interface SnapshotsRepo {
  append(input: {
    projectId: string;
    version: number;
    document: ProjectDocument;
    createdBy: string | null;
  }): Promise<SnapshotRow>;
  latest(projectId: string): Promise<SnapshotRow | null>;
  getByVersion(projectId: string, version: number): Promise<SnapshotRow | null>;
  list(projectId: string): Promise<readonly SnapshotRow[]>;
}

/** Input for the atomic lazy-provision path on first OIDC login. */
export interface CreateUserWithIdentityInput {
  readonly email: string;
  readonly displayName: string;
  readonly isAdmin: boolean;
  readonly issuer: string;
  readonly subject: string;
}

export interface Repository {
  readonly users: UsersRepo;
  readonly localCredentials: LocalCredentialsRepo;
  readonly federatedIdentities: FederatedIdentitiesRepo;
  readonly sessions: SessionsRepo;
  readonly auditLog: AuditLogRepo;
  readonly projects: ProjectsRepo;
  readonly projectMembers: ProjectMembersRepo;
  readonly snapshots: SnapshotsRepo;
  /**
   * Lazy-create a user and their federated identity in ONE transaction (OIDC
   * first login). Either both rows land or neither does.
   */
  createUserWithIdentity(
    input: CreateUserWithIdentityInput,
  ): Promise<{ user: UserRow; identity: FederatedIdentityRow }>;
}
