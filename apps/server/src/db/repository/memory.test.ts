// Behavioural tests for the repository contract (issue #56). They run against
// the in-memory implementation; the Drizzle implementation mirrors the same
// semantics. The point is the invariants — uniqueness and append-only history.

import { parseProjectJson } from "@arch-vis/schema";
import { describe, expect, it } from "vitest";

import { createMemoryRepository } from "./memory";

import type { ProjectDocument } from "@arch-vis/schema";

function sampleDocument(): ProjectDocument {
  const result = parseProjectJson({
    $schemaVersion: "1.0.0",
    project: { id: "demo", name: "Demo" },
    mvps: [{ id: "mvp1", name: "v1", order: 1, color: "#ffffff" }],
    layers: [
      { id: "business", order: 1, label: "Business" },
      { id: "architecture", order: 2, label: "Architecture" },
      { id: "engineering", order: 3, label: "Engineering" },
    ],
    elements: [],
  });
  if (!result.ok) throw new Error(`fixture is invalid: ${result.error}`);
  return result.value;
}

describe("users repo", () => {
  it("enforces email uniqueness", async () => {
    const repo = createMemoryRepository();
    await repo.users.create({ email: "a@example.com", displayName: "A" });
    await expect(repo.users.create({ email: "a@example.com", displayName: "A2" })).rejects.toThrow(
      /email/,
    );
  });

  it("self-heals disabled → active on login, but never unblocks", async () => {
    const repo = createMemoryRepository();
    const disabled = await repo.users.create({
      email: "d@example.com",
      displayName: "D",
      status: "disabled",
    });
    const blocked = await repo.users.create({
      email: "b@example.com",
      displayName: "B",
      status: "blocked",
    });

    const healed = await repo.users.recordLogin(disabled.id, new Date());
    expect(healed?.status).toBe("active");
    expect(healed?.lastLoginAt).toBeInstanceOf(Date);

    const stillBlocked = await repo.users.recordLogin(blocked.id, new Date());
    expect(stillBlocked?.status).toBe("blocked");
  });
});

describe("federated identities repo", () => {
  it("enforces (issuer, subject) uniqueness", async () => {
    const repo = createMemoryRepository();
    const u1 = await repo.users.create({ email: "u1@example.com", displayName: "U1" });
    const u2 = await repo.users.create({ email: "u2@example.com", displayName: "U2" });
    await repo.federatedIdentities.create({ userId: u1.id, issuer: "iss", subject: "sub" });
    await expect(
      repo.federatedIdentities.create({ userId: u2.id, issuer: "iss", subject: "sub" }),
    ).rejects.toThrow(/issuer_subject/);
  });
});

describe("createUserWithIdentity", () => {
  it("creates a user and identity together", async () => {
    const repo = createMemoryRepository();
    const { user, identity } = await repo.createUserWithIdentity({
      email: "new@example.com",
      displayName: "New",
      isAdmin: false,
      issuer: "iss",
      subject: "sub-1",
    });
    expect(identity.userId).toBe(user.id);
    expect(await repo.users.findByEmail("new@example.com")).not.toBeNull();
    expect(await repo.federatedIdentities.findByIssuerSubject("iss", "sub-1")).not.toBeNull();
  });
});

describe("snapshots repo (append-only)", () => {
  it("appends versions and reads them back; latest tracks the head", async () => {
    const repo = createMemoryRepository();
    const owner = await repo.users.create({ email: "o@example.com", displayName: "O" });
    const project = await repo.projects.create({ name: "P", ownerId: owner.id });
    const doc = sampleDocument();

    await repo.snapshots.append({
      projectId: project.id,
      version: 1,
      document: doc,
      createdBy: owner.id,
    });
    await repo.snapshots.append({
      projectId: project.id,
      version: 2,
      document: doc,
      createdBy: owner.id,
    });

    expect((await repo.snapshots.latest(project.id))?.version).toBe(2);
    expect((await repo.snapshots.list(project.id)).map((s) => s.version)).toEqual([1, 2]);
    expect((await repo.snapshots.getByVersion(project.id, 1))?.document).toEqual(doc);
  });

  it("rejects a duplicate (project, version) — history is immutable", async () => {
    const repo = createMemoryRepository();
    const owner = await repo.users.create({ email: "o2@example.com", displayName: "O2" });
    const project = await repo.projects.create({ name: "P", ownerId: owner.id });
    const doc = sampleDocument();
    await repo.snapshots.append({
      projectId: project.id,
      version: 1,
      document: doc,
      createdBy: null,
    });
    await expect(
      repo.snapshots.append({ projectId: project.id, version: 1, document: doc, createdBy: null }),
    ).rejects.toThrow(/project_version/);
  });

  it("exposes no update or delete method on the snapshots repo", () => {
    const repo = createMemoryRepository();
    const snapshotKeys = Object.keys(repo.snapshots);
    expect(snapshotKeys).toEqual(["append", "latest", "getByVersion", "list"]);
  });
});
