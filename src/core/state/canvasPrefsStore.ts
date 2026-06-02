// ============================================================================
// canvasPrefsStore — persisted readability preferences for the canvas
// ============================================================================
// Tier-2 view state, but unlike the per-session view (layer / MVP / selection)
// these are sticky personal preferences worth remembering across reloads, so
// they go through the persist middleware — same pattern as uiStore.
//
// Every lever here is individually toggleable from the DISPLAY popover; the
// defaults are chosen to open a dense diagram as a readable overview, but any
// of them can be switched off.
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "architecture-visualizer:canvas-prefs";

export type NodeDensity = "comfortable" | "compact";
export type EdgeLabelMode = "hover" | "always";
export type LayoutSpacing = "cozy" | "normal" | "spacious";

export interface CanvasPrefsState {
  density: NodeDensity;
  edgeLabels: EdgeLabelMode;
  /** Dim everything outside the SELECTED node's neighborhood. */
  focusOnSelect: boolean;
  /** Dim everything outside the HOVERED node's neighborhood (no click needed). */
  hoverFocus: boolean;
  /** Open domain groups collapsed by default — a clean subsystem overview. */
  defaultCollapse: boolean;
  /** Bundle the many links between two expanded groups into one ×N link. */
  aggregateCrossGroup: boolean;
  /** ELK node/rank spacing — trades compactness for breathing room. */
  layoutSpacing: LayoutSpacing;

  setDensity: (density: NodeDensity) => void;
  setEdgeLabels: (mode: EdgeLabelMode) => void;
  setFocusOnSelect: (focus: boolean) => void;
  setHoverFocus: (focus: boolean) => void;
  setDefaultCollapse: (collapse: boolean) => void;
  setAggregateCrossGroup: (aggregate: boolean) => void;
  setLayoutSpacing: (spacing: LayoutSpacing) => void;
}

export const useCanvasPrefsStore = create<CanvasPrefsState>()(
  persist(
    (set) => ({
      // Defaults open a dense diagram as a readable overview; all switchable.
      density: "comfortable",
      edgeLabels: "hover",
      focusOnSelect: true,
      hoverFocus: true,
      defaultCollapse: true,
      aggregateCrossGroup: true,
      layoutSpacing: "normal",

      setDensity: (density) => {
        set({ density });
      },
      setEdgeLabels: (edgeLabels) => {
        set({ edgeLabels });
      },
      setFocusOnSelect: (focusOnSelect) => {
        set({ focusOnSelect });
      },
      setHoverFocus: (hoverFocus) => {
        set({ hoverFocus });
      },
      setDefaultCollapse: (defaultCollapse) => {
        set({ defaultCollapse });
      },
      setAggregateCrossGroup: (aggregateCrossGroup) => {
        set({ aggregateCrossGroup });
      },
      setLayoutSpacing: (layoutSpacing) => {
        set({ layoutSpacing });
      },
    }),
    { name: STORAGE_KEY, version: 2 },
  ),
);
