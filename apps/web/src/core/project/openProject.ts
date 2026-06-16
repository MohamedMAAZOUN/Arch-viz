// ============================================================================
// openProject — the two ways to load a document, with the server context kept
// honest
// ============================================================================
// Both paths converge on `loadProject` (doc + view reset). The difference is
// provenance: a bundled architecture is local-only (clear the server context),
// a server project records its id/role/version so the save flow and history UI
// know it is server-backed. Every document — bundled or from the API — passes
// the shared `parseProjectJson` / `parseProjectYaml` trust boundary.
// ============================================================================

import { parseProjectJson } from "@arch-vis/schema";

import { projectsApi, type ProjectDetail } from "@/core/api/projects";
import { loadArchitectureById } from "@/core/doc/loadArchitectureById";
import { loadProject } from "@/core/doc/loadProject";
import { err, ok, type Result } from "@/core/errors";
import { useProjectContextStore } from "@/core/state/projectContextStore";

/** Load a bundled architecture (offline seed/fallback) — local-only document. */
export async function openBundledArchitecture(id: string): Promise<Result<true>> {
  const result = await loadArchitectureById(id);
  if (result.ok) useProjectContextStore.getState().setServerProject(null);
  return result;
}

/** Load a server project's latest committed document and record the context. */
export async function openServerProject(id: string): Promise<Result<true>> {
  const detail = await projectsApi.get(id);
  if (!detail.ok) return err(detail.error.message);
  return adoptServerProject(detail.value);
}

/** Load an already-fetched detail into the doc + context (shared by create). */
export function adoptServerProject(detail: ProjectDetail): Result<true> {
  if (detail.document === null || detail.document === undefined) {
    return err("This project has no committed version yet.");
  }
  const parsed = parseProjectJson(detail.document);
  if (!parsed.ok) return err(parsed.error);

  loadProject(parsed.value);
  useProjectContextStore.getState().setServerProject({
    id: detail.project.id,
    name: detail.project.name,
    role: detail.role,
    version: detail.version,
  });
  return ok(true);
}
