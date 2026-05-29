// ============================================================================
// viewStore — how the user is currently looking at the document
// ============================================================================
// Tier 2 state per the engineering guide: view state, NOT document state.
// Each user has their own layer, MVP focus, viewport — not shared via Yjs.
//
// Keep selectors NARROW. Components subscribe to the slice they actually use.
// ============================================================================

import { create } from "zustand";

import type { LayerId, MvpRef } from "@/core/schema/schema";

export interface ViewState {
  currentLayer: LayerId;
  currentMvp: MvpRef | null;
  viewport: { x: number; y: number; zoom: number };

  setLayer: (layer: LayerId) => void;
  setMvp: (mvp: MvpRef) => void;
  setViewport: (vp: { x: number; y: number; zoom: number }) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  currentLayer: "architecture",
  currentMvp: null,
  viewport: { x: 0, y: 0, zoom: 1 },

  setLayer: (currentLayer) => {
    set({ currentLayer });
  },
  setMvp: (currentMvp) => {
    set({ currentMvp });
  },
  setViewport: (viewport) => {
    set({ viewport });
  },
}));
