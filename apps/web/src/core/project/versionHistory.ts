// ============================================================================
// versionHistory — list + restore committed snapshots (#62/#64)
// ============================================================================
// History is immutable: "restore" loads version N back into the draft and, for
// an editor, commits it as a NEW head (ADR 0014). The document round-trips
// through the shared parser before it touches the DocStore, so a restore can
// never load a shape the renderer can't draw.
// ============================================================================

import { parseProjectJson } from "@arch-vis/schema";

import { projectsApi, type SnapshotMeta } from "@/core/api/projects";
import { loadProject } from "@/core/doc/loadProject";
import { err, ok, type Result } from "@/core/errors";
import { useProjectContextStore } from "@/core/state/projectContextStore";


export type RestoreOutcome =
  | { readonly kind: "restored-head"; readonly version: number }
  | { readonly kind: "loaded"; readonly version: number };

/** Snapshot metadata for the open server project, newest first. */
export async function listVersions(): Promise<Result<readonly SnapshotMeta[]>> {
  const server = useProjectContextStore.getState().server;
  if (server === null) return err("No server project is open.");
  const res = await projectsApi.listSnapshots(server.id);
  if (!res.ok) return err(res.error.message);
  return ok([...res.value].sort((a, b) => b.version - a.version));
}

/** Load version N into the draft; commit it as a new head when allowed. */
export async function restoreVersion(version: number): Promise<Result<RestoreOutcome>> {
  const server = useProjectContextStore.getState().server;
  if (server === null) return err("No server project is open.");

  const snapshot = await projectsApi.getSnapshot(server.id, version);
  if (!snapshot.ok) return err(snapshot.error.message);

  const parsed = parseProjectJson(snapshot.value.document);
  if (!parsed.ok) return err(parsed.error);

  // loadProject clears the server context (local-by-default); re-establish it
  // since we are still inside the same server project.
  loadProject(parsed.value);
  useProjectContextStore.getState().setServerProject(server);

  // Editors restore by appending the old document as the new head (#62).
  if (server.role !== "viewer") {
    const commit = await projectsApi.commit(server.id, parsed.value);
    if (commit.ok) {
      useProjectContextStore.getState().setVersion(commit.value.version);
      return ok({ kind: "restored-head", version: commit.value.version });
    }
    return err(commit.error.message);
  }
  return ok({ kind: "loaded", version });
}
