// Unit tests for the pure authorization function (#61). No Fastify, no repo —
// just (user, project, membership) → role → capability. This is the same
// function the Hocuspocus onAuthenticate hook will reuse.

import { describe, expect, it } from "vitest";

import { can, resolveProjectRole } from "./authorization";

import type { ProjectRow, UserRow } from "../db/schema";

const user = (id: string) => ({ id }) as Pick<UserRow, "id">;
const project = (over: Partial<Pick<ProjectRow, "ownerId" | "isPublic">> = {}) => ({
  ownerId: "owner-1",
  isPublic: false,
  ...over,
});

describe("resolveProjectRole", () => {
  it("the owner is owner regardless of membership", () => {
    expect(resolveProjectRole(user("owner-1"), project(), null)).toBe("owner");
    expect(resolveProjectRole(user("owner-1"), project({ isPublic: true }), null)).toBe("owner");
  });

  it("a member gets their membership role", () => {
    expect(resolveProjectRole(user("u2"), project(), { role: "editor" })).toBe("editor");
    expect(resolveProjectRole(user("u2"), project(), { role: "viewer" })).toBe("viewer");
  });

  it("a public project grants implicit viewer to anyone, including guests", () => {
    expect(resolveProjectRole(null, project({ isPublic: true }), null)).toBe("viewer");
    expect(resolveProjectRole(user("u3"), project({ isPublic: true }), null)).toBe("viewer");
  });

  it("a private project with no relationship is no access", () => {
    expect(resolveProjectRole(null, project(), null)).toBeNull();
    expect(resolveProjectRole(user("stranger"), project(), null)).toBeNull();
  });
});

describe("can", () => {
  it("owner can do everything", () => {
    for (const cap of ["view", "edit", "delete", "manage"] as const) {
      expect(can("owner", cap)).toBe(true);
    }
  });

  it("editor can view and edit but not delete or manage", () => {
    expect(can("editor", "view")).toBe(true);
    expect(can("editor", "edit")).toBe(true);
    expect(can("editor", "delete")).toBe(false);
    expect(can("editor", "manage")).toBe(false);
  });

  it("viewer can only view", () => {
    expect(can("viewer", "view")).toBe(true);
    expect(can("viewer", "edit")).toBe(false);
    expect(can("viewer", "delete")).toBe(false);
    expect(can("viewer", "manage")).toBe(false);
  });

  it("no role can do nothing", () => {
    for (const cap of ["view", "edit", "delete", "manage"] as const) {
      expect(can(null, cap)).toBe(false);
    }
  });
});
