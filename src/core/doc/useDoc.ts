// ============================================================================
// useDoc — React subscription to DocStore
// ============================================================================
// The bridge from Yjs (DocStore is Yjs-backed) to React renders. Returns the
// current document snapshot or null when no project is loaded.
// ============================================================================

import { useEffect, useState } from "react";

import { docStore } from "@/core/doc/DocStore";

import type { ProjectDocument } from "@/core/schema/schema";

export function useDoc(): ProjectDocument | null {
  const [doc, setDoc] = useState<ProjectDocument | null>(() => docStore.get());

  useEffect(() => {
    return docStore.subscribe(setDoc);
  }, []);

  return doc;
}
