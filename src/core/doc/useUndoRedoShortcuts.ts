// ============================================================================
// useUndoRedoShortcuts — global keyboard shortcuts for undo/redo
// ============================================================================
// Listens at the window level. Skips events when focus is in an input/
// textarea/contentEditable so typing remains uninterrupted. Mount once
// at the app shell.
//
// Bindings:
//   Cmd/Ctrl+Z         → undo
//   Cmd/Ctrl+Shift+Z   → redo
//   Cmd/Ctrl+Y         → redo (Windows convention)
// ============================================================================

import { useEffect } from "react";

import { docStore } from "@/core/doc/DocStore";

export function useUndoRedoShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isUndoRedoModifier(e)) return;
      if (isEditingTextField(e.target)) return;

      const key = e.key.toLowerCase();

      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        docStore.undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        docStore.redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}

function isUndoRedoModifier(e: KeyboardEvent): boolean {
  // macOS uses Cmd; everyone else uses Ctrl. Don't accept both at once.
  return e.metaKey !== e.ctrlKey;
}

function isEditingTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
