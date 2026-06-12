// ============================================================================
// DeleteElementButton — remove the selected element from the document
// ============================================================================
// Two-step inline confirm when the element has dependents (connections or
// child elements), since removing it cascades to them. A clean leaf deletes on
// the first click. Removal goes through docStore (one undo step) and clears the
// selection so the inspector tucks away.
// ============================================================================

import { useState } from "react";

import { docStore } from "@/core/doc/DocStore";
import { countElementDependents } from "@/core/doc/elementDependents";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useSelectionStore } from "@/core/state/selectionStore";

import "@/features/inspector/sections/DocsAnnotations.css";

export function DeleteElementButton({ elementId }: { elementId: string }) {
  const doc = useDocSnapshot();
  const clearSelection = useSelectionStore((s) => s.clear);
  const [confirming, setConfirming] = useState(false);

  if (doc === null) return null;

  const { connections, descendants } = countElementDependents(doc, elementId);
  const hasDependents = connections > 0 || descendants > 0;

  const remove = () => {
    docStore.removeElement(elementId);
    clearSelection();
    setConfirming(false);
  };

  const onClick = () => {
    if (hasDependents && !confirming) {
      setConfirming(true);
      return;
    }
    remove();
  };

  return (
    <div className="docs-view">
      {confirming ? (
        <div className="inspector-empty-row">
          This also removes {dependentSummary(connections, descendants)}. Click again to confirm.
        </div>
      ) : null}
      <button
        type="button"
        className="docs-btn docs-btn--danger"
        onClick={onClick}
        onBlur={() => {
          setConfirming(false);
        }}
      >
        {confirming ? "Confirm delete" : "Delete element"}
      </button>
    </div>
  );
}

function dependentSummary(connections: number, descendants: number): string {
  const parts: string[] = [];
  if (descendants > 0)
    parts.push(`${String(descendants)} nested element${descendants === 1 ? "" : "s"}`);
  if (connections > 0)
    parts.push(`${String(connections)} connection${connections === 1 ? "" : "s"}`);
  return parts.join(" and ");
}
