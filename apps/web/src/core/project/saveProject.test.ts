import { parseProjectDocument } from "@arch-vis/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/core/api/http";
import type { ProjectDetail, SnapshotMeta } from "@/core/api/projects";

const commit = vi.fn<(id: string, document: unknown) => Promise<ApiResult<SnapshotMeta>>>();
const create = vi.fn<(input: { document?: unknown }) => Promise<ApiResult<ProjectDetail>>>();
vi.mock("@/core/api/projects", () => ({ projectsApi: { commit, create } }));

const { docStore } = await import("@/core/doc/DocStore");
const { useProjectContextStore } = await import("@/core/state/projectContextStore");
const { useSessionStore } = await import("@/core/state/sessionStore");
const { saveProject } = await import("@/core/project/saveProject");

function loadDoc() {
  docStore.load(
    parseProjectDocument({
      $schemaVersion: "1.0.0",
      project: { id: "p", name: "Acme" },
      mvps: [{ id: "mvp1", name: "First", order: 1, color: "#112233" }],
      layers: [
        { id: "business", order: 1, label: "Business" },
        { id: "architecture", order: 2, label: "Architecture" },
        { id: "engineering", order: 3, label: "Engineering" },
      ],
      elements: [],
      connections: [],
    }),
  );
}

describe("saveProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadDoc();
    useProjectContextStore.setState({ server: null });
    useSessionStore.setState({ status: "guest", user: null, loginPrompt: null });
  });

  it("commits a snapshot for a server-backed project and stamps the version", async () => {
    useProjectContextStore.getState().setServerProject({ id: "srv1", name: "Acme", role: "editor", version: 3 });
    commit.mockResolvedValue({ ok: true, value: { version: 4, createdBy: "u1", createdAt: "now" } });

    const outcome = await saveProject();

    expect(outcome).toEqual({ kind: "committed", version: 4 });
    expect(commit).toHaveBeenCalledWith("srv1", expect.anything());
    expect(useProjectContextStore.getState().server?.version).toBe(4);
  });

  it("refuses to commit as a viewer", async () => {
    useProjectContextStore.getState().setServerProject({ id: "srv1", name: "Acme", role: "viewer", version: 1 });
    const outcome = await saveProject();
    expect(outcome).toEqual({ kind: "read-only" });
    expect(commit).not.toHaveBeenCalled();
  });

  it("prompts login for a guest with a local-only document", async () => {
    const outcome = await saveProject();
    expect(outcome).toEqual({ kind: "needs-auth" });
    expect(useSessionStore.getState().loginPrompt).toBe("save");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a server project from the draft when authenticated", async () => {
    useSessionStore.setState({ status: "authenticated" });
    create.mockResolvedValue({
      ok: true,
      value: {
        project: { id: "srv9", name: "Acme", ownerId: "u1", isPublic: false, createdAt: "now", updatedAt: "now" },
        document: {},
        version: 1,
        role: "owner",
      },
    });

    const outcome = await saveProject();

    expect(outcome).toEqual({ kind: "created", version: 1 });
    expect(create).toHaveBeenCalledOnce();
    expect(useProjectContextStore.getState().server).toMatchObject({ id: "srv9", role: "owner", version: 1 });
  });
});
