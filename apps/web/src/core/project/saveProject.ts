// ============================================================================
// saveProject — the server-aware "save" action (ADR 0014 shared-commit)
// ============================================================================
// "Save" means different things by provenance (issue #64):
//   • server-backed project → commit a snapshot (any editor may; the snapshot
//     records who did it — shared-commit semantics);
//   • local-only project, authenticated → offer to save the draft to the
//     server as a new project;
//   • guest → the save action becomes the login prompt.
// The local draft is the source of truth throughout; a server failure never
// loses it.
// ============================================================================

import { projectsApi } from "@/core/api/projects";
import { docStore } from "@/core/doc/DocStore";
import { useProjectContextStore } from "@/core/state/projectContextStore";
import { useSessionStore } from "@/core/state/sessionStore";

export type SaveOutcome =
  | { readonly kind: "committed"; readonly version: number }
  | { readonly kind: "created"; readonly version: number }
  | { readonly kind: "needs-auth" }
  | { readonly kind: "read-only" }
  | { readonly kind: "noop" }
  | { readonly kind: "error"; readonly message: string };

/** Commit the draft, or (when local/guest) start the save-to-server flow. */
export async function saveProject(): Promise<SaveOutcome> {
  const doc = docStore.get();
  if (doc === null) return { kind: "noop" };

  const server = useProjectContextStore.getState().server;
  if (server !== null) {
    if (server.role === "viewer") return { kind: "read-only" };
    const res = await projectsApi.commit(server.id, doc);
    if (res.ok) {
      docStore.commit();
      useProjectContextStore.getState().setVersion(res.value.version);
      return { kind: "committed", version: res.value.version };
    }
    // A 401 already triggered the re-login prompt via the http boundary.
    if (res.error.kind === "unauthorized") return { kind: "needs-auth" };
    return { kind: "error", message: res.error.message };
  }

  // Local-only document: needs an account to reach the server.
  if (useSessionStore.getState().status !== "authenticated") {
    useSessionStore.getState().openLoginPrompt("save");
    return { kind: "needs-auth" };
  }
  return importDraftAsProject();
}

/** Create a new server project seeded with the current draft (first save / the
 *  one-time post-login draft import). The draft is committed locally so the
 *  dirty indicator clears. */
export async function importDraftAsProject(): Promise<SaveOutcome> {
  const doc = docStore.get();
  if (doc === null) return { kind: "noop" };

  const res = await projectsApi.create({ document: doc });
  if (!res.ok) {
    if (res.error.kind === "unauthorized") return { kind: "needs-auth" };
    return { kind: "error", message: res.error.message };
  }

  const detail = res.value;
  useProjectContextStore.getState().setServerProject({
    id: detail.project.id,
    name: detail.project.name,
    role: detail.role,
    version: detail.version,
  });
  docStore.commit();
  return { kind: "created", version: detail.version ?? 1 };
}
