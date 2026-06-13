// ============================================================================
// uiStore — floating-panel UI state (pinned preference + open/peek state)
// ============================================================================
// The workspace has three floating panels over a full-bleed canvas:
//   - top   → view controls (layer / MVP / reorganize)
//   - left  → navigator (project overview, search, diagnostics)
//   - right → inspector (selected element)
//
// Each panel has two pieces of state:
//   - `pinned` — a personal preference (persisted). Pinned panels stay open
//     and ignore outside-click / Esc.
//   - `open` — whether the panel is expanded right now. Ephemeral (per-session,
//     NOT persisted): on load it's derived from `pinned`.
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "architecture-visualizer:ui";

export type PanelId = "top" | "left" | "right";

interface PanelState {
  /** Persisted. Pinned panels stay open and ignore outside-click / Esc. */
  pinned: boolean;
  /** Ephemeral. Whether the panel is currently expanded. */
  open: boolean;
}

const PANEL_IDS: readonly PanelId[] = ["top", "left", "right"];

/** Defaults: keep view controls always available; navigator + inspector start
 *  collapsed to their edge pills for a clean canvas. */
const DEFAULT_PINNED: Record<PanelId, boolean> = {
  top: true,
  left: false,
  right: false,
};

/** A fresh panel map where `open` mirrors the `pinned` preference. */
function panelsFromPinned(pinned: Record<PanelId, boolean>): Record<PanelId, PanelState> {
  return {
    top: { pinned: pinned.top, open: pinned.top },
    left: { pinned: pinned.left, open: pinned.left },
    right: { pinned: pinned.right, open: pinned.right },
  };
}

export interface UiState {
  panels: Record<PanelId, PanelState>;

  openPanel: (id: PanelId) => void;
  closePanel: (id: PanelId) => void;
  togglePanelPinned: (id: PanelId) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      panels: panelsFromPinned(DEFAULT_PINNED),

      openPanel: (id) => {
        set((s) => ({ panels: { ...s.panels, [id]: { ...s.panels[id], open: true } } }));
      },
      closePanel: (id) => {
        set((s) => ({ panels: { ...s.panels, [id]: { ...s.panels[id], open: false } } }));
      },
      togglePanelPinned: (id) => {
        set((s) => {
          const pinned = !s.panels[id].pinned;
          // Pinning forces the panel open; unpinning leaves it open until the
          // user dismisses it (outside-click / Esc / collapse).
          return {
            panels: {
              ...s.panels,
              [id]: { pinned, open: pinned ? true : s.panels[id].open },
            },
          };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      // Persist only the pinned preference — open/peek state is per-session.
      partialize: (s) => ({
        panels: {
          top: { pinned: s.panels.top.pinned },
          left: { pinned: s.panels.left.pinned },
          right: { pinned: s.panels.right.pinned },
        },
      }),
      // v0/v1 stored { inspectorOpen, inspectorWidth } from the old docked
      // sidebar. That shape is gone; start fresh from defaults.
      migrate: () => ({
        panels: {
          top: { pinned: DEFAULT_PINNED.top },
          left: { pinned: DEFAULT_PINNED.left },
          right: { pinned: DEFAULT_PINNED.right },
        },
      }),
      // On rehydrate, rebuild the ephemeral `open` flags from persisted `pinned`.
      merge: (persisted, current) => {
        const p = persisted as
          | { panels?: Partial<Record<PanelId, { pinned?: boolean }>> }
          | undefined;
        const pinned: Record<PanelId, boolean> = { ...DEFAULT_PINNED };
        for (const id of PANEL_IDS) {
          const value = p?.panels?.[id]?.pinned;
          if (typeof value === "boolean") pinned[id] = value;
        }
        return { ...current, panels: panelsFromPinned(pinned) };
      },
    },
  ),
);
