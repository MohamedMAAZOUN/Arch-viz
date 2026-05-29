// ============================================================================
// bootstrap — load the example project on startup
// ============================================================================
// v1 demo behavior: parse the YAML example shipped in docs/, push it into
// DocStore, and select the latest MVP as the initial view.
//
// v1.5 will replace this with a file picker + drag-drop zone.
// ============================================================================

import { docStore } from "@/core/doc/DocStore";
import { parseProjectYaml } from "@/core/schema/parse";
import { useViewStore } from "@/core/state/viewStore";
import exampleYaml from "@/data/example-project.yaml?raw";

export function bootstrapExampleProject(): void {
  const result = parseProjectYaml(exampleYaml);
  if (!result.ok) {
    console.error("Failed to load example project:\n", result.error);
    return;
  }

  const doc = result.value;
  docStore.load(doc);

  // Set the initial MVP to the latest one (highest order)
  const latestMvp = [...doc.mvps].sort((a, b) => b.order - a.order)[0];
  if (latestMvp !== undefined) {
    useViewStore.getState().setMvp(latestMvp.id);
  }
}
