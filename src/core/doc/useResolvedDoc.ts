// ============================================================================
// useResolvedDoc — visible elements and connections at the current view
// ============================================================================
// Combines the doc snapshot with the current view state (layer, mvp) and
// runs the pure resolve() function. Memoizes on (doc, layer, mvp) so it only
// recomputes when one of them changes.
// ============================================================================

import { useMemo } from "react";

import { resolve } from "@/core/doc/resolve";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useViewStore } from "@/core/state/viewStore";

import type { ResolvedState } from "@/core/doc/resolve";

export function useResolvedDoc(): ResolvedState | null {
  const doc = useDocSnapshot();
  const currentLayer = useViewStore((s) => s.currentLayer);
  const currentMvp = useViewStore((s) => s.currentMvp);
  const groupExpansion = useViewStore((s) => s.groupExpansion);

  return useMemo(() => {
    if (doc === null || currentMvp === null) return null;
    return resolve(doc, currentLayer, currentMvp, groupExpansion);
  }, [doc, currentLayer, currentMvp, groupExpansion]);
}
