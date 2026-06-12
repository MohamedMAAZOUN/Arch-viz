// ============================================================================
// useDeleteSelectedShortcut — Delete/Backspace removes the selected element(s)
// ============================================================================
// Listens at the window level, skipping text-field focus so editing is never
// interrupted. Fires only when at least one element is selected, and delegates
// to deleteSelectedElements (which handles the cascade confirmation for both
// single and multi-selection). Mount once at the app shell.
// ============================================================================

import { useEffect } from "react";

import { deleteSelectedElements } from "@/core/doc/deleteSelection";
import { useSelectionStore } from "@/core/state/selectionStore";

export function useDeleteSelectedShortcut(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isEditingTextField(e.target)) return;
      if (useSelectionStore.getState().selectedIds.length === 0) return;

      e.preventDefault();
      deleteSelectedElements();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}

function isEditingTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
