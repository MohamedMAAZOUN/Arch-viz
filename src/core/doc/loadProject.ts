// ============================================================================
// loadProject — atomic "open a project" action
// ============================================================================
// Composes the two things that must happen together when a project loads:
//   1. The document goes into the DocStore.
//   2. The view defaults to the latest MVP so all elements are visible.
//
// Every load path (load-example button, file picker in v1.5) routes through
// this function. Keeps doc+view setup symmetric.
// ============================================================================

import { docStore } from "@/core/doc/DocStore";
import { useViewStore } from "@/core/state/viewStore";

import type { ProjectDocument } from "@/core/schema/schema";

export function loadProject(project: ProjectDocument): void {
  docStore.load(project);

  // Default the MVP slider to the latest version so the freshly-loaded
  // project shows all elements at once instead of an empty canvas.
  const latestMvp = [...project.mvps].sort((a, b) => b.order - a.order)[0];
  if (latestMvp !== undefined) {
    useViewStore.getState().setMvp(latestMvp.id);
  }
}
