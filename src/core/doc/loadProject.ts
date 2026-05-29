// ============================================================================
// loadProject — atomic "open a project" action
// ============================================================================
// Composes the things that must happen together when a project loads:
//   1. The document goes into the DocStore.
//   2. The view defaults to the latest MVP so all elements are visible.
//   3. The layer resets to "business" (lowest order, all minLayer values pass)
//      so a project loaded from a different layer context is never blank.
//
// Every load path (load-example button, file picker) routes through this
// function. Keeps doc + view setup symmetric.
// ============================================================================

import { docStore } from "@/core/doc/DocStore";
import { useViewStore } from "@/core/state/viewStore";

import type { ProjectDocument } from "@/core/schema/schema";

export function loadProject(project: ProjectDocument): void {
  docStore.load(project);

  const viewStore = useViewStore.getState();

  // Default the MVP slider to the latest version so the freshly-loaded
  // project shows all elements at once instead of an empty canvas.
  const latestMvp = [...project.mvps].sort((a, b) => b.order - a.order)[0];
  if (latestMvp !== undefined) {
    viewStore.setMvp(latestMvp.id);
  }

  // Reset to the broadest layer so elements with any minLayer value are visible.
  // Without this, loading a project while on "engineering" yields a blank canvas
  // when the new project only defines business-layer elements.
  viewStore.setLayer("business");
}
