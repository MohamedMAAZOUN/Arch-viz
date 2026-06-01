// ============================================================================
// useDeleteSelectedShortcut — Delete/Backspace removes the selected element
// ============================================================================
// Listens at the window level, skipping text-field focus so editing is never
// interrupted. Fires only when an element is selected. When removal would
// cascade to dependents (connections or nested elements), it asks for explicit
// confirmation first — the cascade is documented in DocStore.removeElement.
// Mount once at the app shell.
// ============================================================================

import { useEffect } from "react";

import { docStore } from "@/core/doc/DocStore";
import { countElementDependents } from "@/core/doc/elementDependents";
import { useSelectionStore } from "@/core/state/selectionStore";

export function useDeleteSelectedShortcut(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isEditingTextField(e.target)) return;

      const selectedId = useSelectionStore.getState().selectedId;
      if (selectedId === null) return;

      const doc = docStore.get();
      if (doc === null) return;

      e.preventDefault();

      const { connections, descendants } = countElementDependents(doc, selectedId);
      if (connections > 0 || descendants > 0) {
        const summary = describeDependents(connections, descendants);
        // Native confirm: destructive and out of the render path. Undo also
        // restores it, but the cascade warrants an explicit acknowledgement.
        if (!window.confirm(`Delete this element? This also removes ${summary}.`)) {
          return;
        }
      }

      docStore.removeElement(selectedId);
      useSelectionStore.getState().clear();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
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

function isEditingTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
