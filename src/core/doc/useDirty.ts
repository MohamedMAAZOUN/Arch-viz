// ============================================================================
// useDirty — reactive draft-vs-committed flag
// ============================================================================
// docStore.dirty() is imperative. This hook turns it into reactive state by
// re-evaluating on every doc change.
// ============================================================================

import { useEffect, useState } from "react";

import { docStore } from "@/core/doc/DocStore";

export function useDirty(): boolean {
  const [dirty, setDirty] = useState(() => docStore.dirty());

  useEffect(() => {
    return docStore.subscribe(() => {
      setDirty(docStore.dirty());
    });
  }, []);

  return dirty;
}
