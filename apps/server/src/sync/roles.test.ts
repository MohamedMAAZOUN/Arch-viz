import { describe, expect, it } from "vitest";

import { resolveSyncAccess } from "./roles";
import { createMemoryRepository } from "../db/repository";

import type { Repository } from "../db/repository";

async function user(repo: Repository, email: string): Promise<string> {
  const u = await repo.users.create({ email, displayName: email });
  return u.id;
}

describe("resolveSyncAccess", () => {
  it("grants the owner edit access", async () => {
    const repo = createMemoryRepository();
    const owner = await user(repo, "owner@x.dev");
    const project = await repo.projects.create({ name: "P", ownerId: owner });
    expect(await resolveSyncAccess(repo, owner, project.id)).toEqual({ role: "owner", canEdit: true });
  });

  it("grants an editor member edit access", async () => {
    const repo = createMemoryRepository();
    const owner = await user(repo, "owner@x.dev");
    const editor = await user(repo, "editor@x.dev");
    const project = await repo.projects.create({ name: "P", ownerId: owner });
    await repo.projectMembers.add({ projectId: project.id, userId: editor, role: "editor" });
    expect(await resolveSyncAccess(repo, editor, project.id)).toEqual({ role: "editor", canEdit: true });
  });

  it("makes a viewer member read-only", async () => {
    const repo = createMemoryRepository();
    const owner = await user(repo, "owner@x.dev");
    const viewer = await user(repo, "viewer@x.dev");
    const project = await repo.projects.create({ name: "P", ownerId: owner });
    await repo.projectMembers.add({ projectId: project.id, userId: viewer, role: "viewer" });
    expect(await resolveSyncAccess(repo, viewer, project.id)).toEqual({ role: "viewer", canEdit: false });
  });

  it("makes a public project read-only for a non-member", async () => {
    const repo = createMemoryRepository();
    const owner = await user(repo, "owner@x.dev");
    const stranger = await user(repo, "stranger@x.dev");
    const project = await repo.projects.create({ name: "P", ownerId: owner, isPublic: true });
    expect(await resolveSyncAccess(repo, stranger, project.id)).toEqual({ role: "viewer", canEdit: false });
  });

  it("denies a non-member on a private project", async () => {
    const repo = createMemoryRepository();
    const owner = await user(repo, "owner@x.dev");
    const stranger = await user(repo, "stranger@x.dev");
    const project = await repo.projects.create({ name: "P", ownerId: owner });
    expect(await resolveSyncAccess(repo, stranger, project.id)).toBeNull();
  });

  it("denies access to a missing project", async () => {
    const repo = createMemoryRepository();
    const someone = await user(repo, "someone@x.dev");
    expect(await resolveSyncAccess(repo, someone, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
