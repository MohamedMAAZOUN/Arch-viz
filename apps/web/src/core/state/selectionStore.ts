// ============================================================================
// selectionStore — currently selected element(s) on the canvas
// ============================================================================
// Separated from viewStore because selection changes on almost every click;
// keeping it in its own store means viewStore subscribers don't re-render.
//
// Selection is a SET (issue #24: box-select + shift-click for bulk move/
// delete), stored as an ordered list so the last-touched element is the
// "primary" one. `selectedId` exposes that primary for the many single-element
// consumers (inspector fields, focus, tour snapshot) that only ever act on one.
// ============================================================================

import { create } from "zustand";

export interface SelectionState {
  /** Ordered selection; the last entry is the primary (most recently added). */
  selectedIds: readonly string[];
  /** The primary selected id (last of `selectedIds`), or null when empty. */
  selectedId: string | null;

  /** Replace the selection with a single element, or clear it with null. */
  select: (id: string | null) => void;
  /** Add the id if absent, remove it if present (shift-click). */
  toggle: (id: string) => void;
  /** Replace the whole selection set (box-select). */
  setMany: (ids: readonly string[]) => void;
  clear: () => void;
}

/** Primary = last selected, mirroring how most editors treat the active item. */
function primaryOf(ids: readonly string[]): string | null {
  return ids.at(-1) ?? null;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIds: [],
  selectedId: null,
  select: (id) => {
    const selectedIds = id === null ? [] : [id];
    set({ selectedIds, selectedId: id });
  },
  toggle: (id) => {
    set((s) => {
      const next = s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id];
      return { selectedIds: next, selectedId: primaryOf(next) };
    });
  },
  setMany: (ids) => {
    set({ selectedIds: ids, selectedId: primaryOf(ids) });
  },
  clear: () => {
    set({ selectedIds: [], selectedId: null });
  },
}));
