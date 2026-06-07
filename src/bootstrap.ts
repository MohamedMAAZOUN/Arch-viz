// ============================================================================
// bootstrap — seed the initial project + view on startup
// ============================================================================
// Runs AFTER draft persistence has synced (see main.tsx), so the Y.Doc may
// already hold a draft restored from IndexedDB. In that case we keep the draft
// and only set the view; otherwise we seed the bundled example as the starting
// document. This ordering is what makes "edits survive a reload" actually hold
// — seeding the example unconditionally would clobber the restored draft.
//
// v1.5 will replace the example seed with a file picker + drag-drop zone.
// ============================================================================

import exampleYaml from "../architectures/example-project.yaml?raw";
import { docStore } from "@/core/doc/DocStore";
import { parseProjectYaml } from "@/core/schema/parse";
import { useViewStore } from "@/core/state/viewStore";

export function bootstrapInitialProject(): void {
  // A non-null doc here means persistence restored a draft — keep it. Only seed
  // the bundled example on a genuinely fresh start (no prior session).
  if (docStore.get() === null) {
    const result = parseProjectYaml(exampleYaml);
    if (!result.ok) {
      console.error("Failed to load example project:\n", result.error);
      return;
    }
    docStore.load(result.value);
  } else {
    // Treat the restored draft as the committed baseline so the app doesn't
    // start spuriously "dirty". The committed-vs-draft distinction is about the
    // file-save flow; IndexedDB only carries the draft, so on restore the two
    // coincide.
    docStore.commit();
  }

  // View state is not persisted, so set it on every startup. Default the MVP
  // slider to the latest version so the canvas shows the full graph instead of
  // an empty pre-history view.
  const doc = docStore.get();
  if (doc === null) return;
  const latestMvp = [...doc.mvps].sort((a, b) => b.order - a.order)[0];
  if (latestMvp !== undefined) {
    useViewStore.getState().setMvp(latestMvp.id);
  }
}
