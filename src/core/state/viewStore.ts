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

/**
 * How the MVP timeline is visualized:
 *  - "single"  — scrub to one point in time (the historical default).
 *  - "overlay" — show the same elements but tinted by the MVP that introduced
 *    each, so multiple MVPs read at once (color-coded with a legend).
 */
export type MvpMode = "single" | "overlay";

/**
 * Canvas pointer tool — how a left-drag / node-drag on the canvas behaves:
 *  - "pan"    — drag empty canvas to pan; nodes are draggable (the hand tool).
 *  - "select" — drag to box-select nodes (the pointer tool); panning then
 *    moves to the middle/right mouse button.
 *  - "lock"   — pan + click-to-select, but nodes can't be moved by dragging
 *    (the layout is locked while you browse).
 */
export type CursorMode = "pan" | "select" | "lock";

export interface ViewState {
  currentLayer: LayerId;
  currentMvp: MvpRef | null;
  mvpMode: MvpMode;
  cursorMode: CursorMode;
  viewport: { x: number; y: number; zoom: number };

  /**
   * Per-element expand/collapse overrides for hierarchical containment.
   * Keyed by element id; the value is the user's *explicit* choice. An element
   * absent from this map falls back to its layer-driven default (a group whose
   * `aggregateAt` includes the current layer defaults to collapsed; everything
   * else defaults to expanded). See `resolve()` for how the default combines
   * with the override.
   *
   * Overrides are view state, not document state — they are per-session and per
   * user, and are cleared whenever a different project is loaded.
   */
  groupExpansion: Readonly<Record<string, boolean>>;

  setLayer: (layer: LayerId) => void;
  setMvp: (mvp: MvpRef) => void;
  setMvpMode: (mode: MvpMode) => void;
  setCursorMode: (mode: CursorMode) => void;
  setViewport: (vp: { x: number; y: number; zoom: number }) => void;
  setGroupExpansion: (elementId: string, expanded: boolean) => void;
  /** Set many expand/collapse overrides at once (collapse-all / expand-all),
   *  so a bulk change is a single store update and one re-layout. */
  setGroupExpansionMany: (entries: Readonly<Record<string, boolean>>) => void;
  clearGroupExpansion: () => void;
}

export const useViewStore = create<ViewState>((set) => ({
  currentLayer: "architecture",
  currentMvp: null,
  mvpMode: "single",
  cursorMode: "pan",
  viewport: { x: 0, y: 0, zoom: 1 },
  groupExpansion: {},

  setLayer: (currentLayer) => {
    set({ currentLayer });
  },
  setMvp: (currentMvp) => {
    set({ currentMvp });
  },
  setMvpMode: (mvpMode) => {
    set({ mvpMode });
  },
  setCursorMode: (cursorMode) => {
    set({ cursorMode });
  },
  setViewport: (viewport) => {
    set({ viewport });
  },
  setGroupExpansion: (elementId, expanded) => {
    set((state) => ({
      groupExpansion: { ...state.groupExpansion, [elementId]: expanded },
    }));
  },
  setGroupExpansionMany: (entries) => {
    set((state) => ({
      groupExpansion: { ...state.groupExpansion, ...entries },
    }));
  },
  clearGroupExpansion: () => {
    set({ groupExpansion: {} });
  },
}));
