// ============================================================================
// uiStore — persistent UI preferences (inspector width, visibility)
// ============================================================================
// Separate from viewStore because these are personal preferences (per-user,
// per-device) — not per-session state. They survive across reloads via
// Zustand's persist middleware.
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "architecture-visualizer:ui";

/** Inspector width in pixels. The default (38.2%) is honored when stored value is null. */
type InspectorWidth = number | null;

/** Constraints chosen for readability — too narrow truncates everything,
 *  too wide eats the canvas. Picked by feel; revisit with real users. */
const MIN_INSPECTOR_WIDTH = 280;
const MAX_INSPECTOR_WIDTH = 720;

export interface UiState {
  inspectorOpen: boolean;
  inspectorWidth: InspectorWidth;

  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  setInspectorWidth: (width: number) => void;
  resetInspectorWidth: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      inspectorOpen: true,
      inspectorWidth: null,

      toggleInspector: () => {
        set((state) => ({ inspectorOpen: !state.inspectorOpen }));
      },
      setInspectorOpen: (inspectorOpen) => {
        set({ inspectorOpen });
      },
      setInspectorWidth: (width) => {
        const clamped = Math.max(MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, width));
        set({ inspectorWidth: clamped });
      },
      resetInspectorWidth: () => {
        set({ inspectorWidth: null });
      },
    }),
    { name: STORAGE_KEY },
  ),
);

export const inspectorWidthBounds = {
  min: MIN_INSPECTOR_WIDTH,
  max: MAX_INSPECTOR_WIDTH,
};
