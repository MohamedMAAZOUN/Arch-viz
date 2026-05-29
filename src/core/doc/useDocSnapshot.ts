// ============================================================================
// useDocSnapshot — React subscription to the DocStore
// ============================================================================
// The canonical way for components to read the current document. Subscribes
// on mount, unsubscribes on unmount, re-renders only when the document
// actually changes.
// ============================================================================

import { useEffect, useState } from "react";

import { docStore } from "@/core/doc/DocStore";

import type { ProjectDocument } from "@/core/schema/schema";

export function useDocSnapshot(): ProjectDocument | null {
  const [snapshot, setSnapshot] = useState<ProjectDocument | null>(() => docStore.get());

  useEffect(() => {
    return docStore.subscribe(setSnapshot);
  }, []);

  return snapshot;
}
