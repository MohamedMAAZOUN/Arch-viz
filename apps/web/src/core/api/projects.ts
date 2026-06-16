// ============================================================================
// Projects API — the typed surface of `/projects/*` (the catalog as a service)
// ============================================================================
// Mirrors apps/server/src/projects. Documents cross the wire as `unknown`; the
// caller re-parses them through the shared `parseProjectJson` trust boundary
// (the same code path the YAML loader uses) before they touch the DocStore.
// ============================================================================

import { z } from "zod";

import { http, type ApiResult, type HttpClient } from "@/core/api/http";

export const ProjectRole = z.enum(["owner", "editor", "viewer"]);
export type ProjectRole = z.infer<typeof ProjectRole>;

export const ServerProject = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
  isPublic: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ServerProject = z.infer<typeof ServerProject>;

const ProjectList = z.object({ projects: z.array(ServerProject) });

/** A project plus its latest committed document and the caller's role. */
export const ProjectDetail = z.object({
  project: ServerProject,
  document: z.unknown(),
  version: z.number().int().nullable(),
  role: ProjectRole,
});
export type ProjectDetail = z.infer<typeof ProjectDetail>;

const CreateResponse = ProjectDetail;

export const SnapshotMeta = z.object({
  version: z.number().int(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});
export type SnapshotMeta = z.infer<typeof SnapshotMeta>;

const SnapshotList = z.object({ snapshots: z.array(SnapshotMeta) });
const SnapshotDetail = SnapshotMeta.extend({ document: z.unknown() });
export type SnapshotDetail = z.infer<typeof SnapshotDetail>;

export interface CreateProjectInput {
  readonly name?: string;
  /** Seed document committed as version 1 (the local-draft import path). */
  readonly document?: unknown;
}

export interface ProjectsApi {
  list(): Promise<ApiResult<readonly ServerProject[]>>;
  get(id: string): Promise<ApiResult<ProjectDetail>>;
  create(input: CreateProjectInput): Promise<ApiResult<ProjectDetail>>;
  /** Append a snapshot — the server-backed "commit" (#62 shared-commit). */
  commit(id: string, document: unknown): Promise<ApiResult<SnapshotMeta>>;
  listSnapshots(id: string): Promise<ApiResult<readonly SnapshotMeta[]>>;
  getSnapshot(id: string, version: number): Promise<ApiResult<SnapshotDetail>>;
}

export function createProjectsApi(client: HttpClient = http): ProjectsApi {
  return {
    list: async () => {
      const res = await client.request("/projects/", { schema: ProjectList });
      return res.ok ? { ok: true, value: res.value.projects } : res;
    },
    get: (id) => client.request(`/projects/${encodeURIComponent(id)}`, { schema: ProjectDetail }),
    create: (input) =>
      client.request("/projects/", { method: "POST", body: input, schema: CreateResponse }),
    commit: (id, document) =>
      client.request(`/projects/${encodeURIComponent(id)}/snapshots`, {
        method: "POST",
        body: { document },
        schema: SnapshotMeta,
      }),
    listSnapshots: async (id) => {
      const res = await client.request(`/projects/${encodeURIComponent(id)}/snapshots`, {
        schema: SnapshotList,
      });
      return res.ok ? { ok: true, value: res.value.snapshots } : res;
    },
    getSnapshot: (id, version) =>
      client.request(`/projects/${encodeURIComponent(id)}/snapshots/${String(version)}`, {
        schema: SnapshotDetail,
      }),
  };
}

export const projectsApi: ProjectsApi = createProjectsApi();
