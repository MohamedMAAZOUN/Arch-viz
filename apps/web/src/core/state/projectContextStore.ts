// ============================================================================
// projectContextStore — is the open document backed by a server project?
// ============================================================================
// View-state tier (ADR 0010). `server` is non-null only when the current
// DocStore document was opened from `/projects/:id`; it carries the id, the
// caller's role, and the latest committed version (so the history UI and the
// save flow know whether "save" means "commit a snapshot" or "offer to save to
// the server"). Loading a bundled architecture or a local file clears it back
// to null — that document is local-only until the user saves it to the server.
// ============================================================================

import { create } from "zustand";

import type { ProjectRole } from "@/core/api/projects";

export interface OpenServerProject {
  readonly id: string;
  readonly name: string;
  readonly role: ProjectRole;
  /** Latest committed version, or null before the first commit. */
  readonly version: number | null;
}

export interface ProjectContextState {
  server: OpenServerProject | null;
  setServerProject: (project: OpenServerProject | null) => void;
  /** Stamp the version after a successful commit/restore. */
  setVersion: (version: number) => void;
}

export const useProjectContextStore = create<ProjectContextState>((set) => ({
  server: null,
  setServerProject: (server) => {
    set({ server });
  },
  setVersion: (version) => {
    set((state) => (state.server ? { server: { ...state.server, version } } : {}));
  },
}));
