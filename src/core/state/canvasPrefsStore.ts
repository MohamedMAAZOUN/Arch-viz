// ============================================================================
// canvasPrefsStore — persisted readability preferences for the canvas
// ============================================================================
// Tier-2 view state, but unlike the per-session view (layer / MVP / selection)
// these are sticky personal preferences worth remembering across reloads, so
// they go through the persist middleware — same pattern as uiStore.
//
// They exist to tame a dense diagram:
//   - density       → comfortable cards vs. compact (name + type only). Compact
//                     also tightens the auto-layout (smaller node footprints).
//   - edgeLabels    → show protocol/count labels always, or only on
//                     hover/selection (the default — labels are the noisiest
//                     thing at edge density; see issue #23).
//   - focusOnSelect → when a node is selected, dim everything not directly
//                     connected to it so the local neighborhood reads clearly.
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "architecture-visualizer:canvas-prefs";

export type NodeDensity = "comfortable" | "compact";
export type EdgeLabelMode = "hover" | "always";

export interface CanvasPrefsState {
  density: NodeDensity;
  edgeLabels: EdgeLabelMode;
  focusOnSelect: boolean;

  setDensity: (density: NodeDensity) => void;
  setEdgeLabels: (mode: EdgeLabelMode) => void;
  setFocusOnSelect: (focus: boolean) => void;
}

export const useCanvasPrefsStore = create<CanvasPrefsState>()(
  persist(
    (set) => ({
      // Defaults chosen to declutter out of the box without surprising anyone:
      // comfortable cards (familiar), labels only on hover (quiet edges), and
      // focus-on-select on (clicking a node spotlights its neighborhood).
      density: "comfortable",
      edgeLabels: "hover",
      focusOnSelect: true,

      setDensity: (density) => {
        set({ density });
      },
      setEdgeLabels: (edgeLabels) => {
        set({ edgeLabels });
      },
      setFocusOnSelect: (focusOnSelect) => {
        set({ focusOnSelect });
      },
    }),
    { name: STORAGE_KEY, version: 1 },
  ),
);
