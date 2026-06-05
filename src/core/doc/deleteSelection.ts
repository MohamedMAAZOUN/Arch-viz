// ============================================================================
// deleteSelection — remove the currently selected element(s), with confirm
// ============================================================================
// Shared by the Delete/Backspace shortcut and the inspector's multi-selection
// summary so both paths warn about the same cascade and behave identically.
// When the removal would cascade to dependents (connections or nested
// elements), it asks for explicit confirmation first — the cascade is
// documented in DocStore.removeElement. The successive removeElement calls land
// within one UndoManager capture window, so a bulk delete is a single undo.
// ============================================================================

import { docStore } from "@/core/doc/DocStore";
import { countElementDependents } from "@/core/doc/elementDependents";
import { useSelectionStore } from "@/core/state/selectionStore";

export function deleteSelectedElements(): void {
  const { selectedIds } = useSelectionStore.getState();
  if (selectedIds.length === 0) return;

  const doc = docStore.get();
  if (doc === null) return;

  let connections = 0;
  let descendants = 0;
  for (const id of selectedIds) {
    const counts = countElementDependents(doc, id);
    connections += counts.connections;
    descendants += counts.descendants;
  }

  if (connections > 0 || descendants > 0) {
    const cascade = describeDependents(connections, descendants);
    const subject =
      selectedIds.length === 1 ? "this element" : `these ${String(selectedIds.length)} elements`;
    // Native confirm: destructive and out of the render path. Undo also restores
    // it, but the cascade warrants an explicit acknowledgement.
    if (!window.confirm(`Delete ${subject}? This also removes ${cascade}.`)) {
      return;
    }
  }

  for (const id of selectedIds) {
    docStore.removeElement(id);
  }
  useSelectionStore.getState().clear();
}

function describeDependents(connections: number, descendants: number): string {
  const parts: string[] = [];
  if (descendants > 0) {
    parts.push(`${String(descendants)} nested element${descendants === 1 ? "" : "s"}`);
  }
  if (connections > 0) {
    parts.push(`${String(connections)} connection${connections === 1 ? "" : "s"}`);
  }
  return parts.join(" and ");
}
