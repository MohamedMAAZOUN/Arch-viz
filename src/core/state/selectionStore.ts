// ============================================================================
// selectionStore — currently selected element(s) on the canvas
// ============================================================================
// Separated from viewStore because selection changes on almost every click;
// keeping it in its own store means viewStore subscribers don't re-render.
// ============================================================================

import { create } from "zustand";

export interface SelectionState {
  selectedId: string | null;
  select: (id: string | null) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedId: null,
  select: (selectedId) => {
    set({ selectedId });
  },
  clear: () => {
    set({ selectedId: null });
  },
}));
