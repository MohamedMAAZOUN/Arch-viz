// ============================================================================
// useUndoRedoState — reactive undo/redo availability flags
// ============================================================================
// DocStore exposes canUndo()/canRedo() but they're imperative. This hook
// turns them into reactive React state by re-reading on every doc change.
// ============================================================================

import { useEffect, useState } from "react";

import { docStore } from "@/core/doc/DocStore";

export function useUndoRedoState(): { canUndo: boolean; canRedo: boolean } {
  const [state, setState] = useState(() => ({
    canUndo: docStore.canUndo(),
    canRedo: docStore.canRedo(),
  }));

  useEffect(() => {
    // The DocStore subscription fires on every doc change. After any change
    // the undo manager's flags may have shifted; re-read them.
    return docStore.subscribe(() => {
      setState({
        canUndo: docStore.canUndo(),
        canRedo: docStore.canRedo(),
      });
    });
  }, []);

  return state;
}
