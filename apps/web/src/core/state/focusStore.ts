// ============================================================================
// focusStore — which elements are currently emphasized (hover / selection / tour)
// ============================================================================
// This store exists to keep the *visual* focus state OFF the React Flow nodes
// array. Dimming used to be baked into each node's `data` (data.dimmed), which
// meant every hover rebuilt the whole nodes array and called setNodes — and a
// wholesale node replacement makes React Flow briefly re-project nested children
// through their parent (snapping them toward the group's origin / upper-left).
// That re-projection walked nodes out from under the pointer, ping-ponging
// mouseenter/leave into the "everything blinks and group children jump" loop.
//
// By publishing the highlight set here instead, hovering only flips a boolean
// inside each node component (a cheap, in-place re-render via a narrow selector)
// — the nodes array, positions, and parentIds never change on hover, so there
// is nothing to re-project and nothing to blink. See Canvas.tsx (publisher) and
// ElementNode / GroupNode (consumers).
// ============================================================================

import { create } from "zustand";

export interface FocusState {
  /**
   * The set of element ids that read as "in focus" — the hovered/selected node
   * plus its direct neighbors, or a tour step's highlight set. `null` means
   * nothing is focused and every node sits at its resting opacity.
   */
  highlightIds: ReadonlySet<string> | null;
  setHighlightIds: (ids: ReadonlySet<string> | null) => void;
}

export const useFocusStore = create<FocusState>((set) => ({
  highlightIds: null,
  setHighlightIds: (highlightIds) => {
    set({ highlightIds });
  },
}));

/**
 * Selector: is this element dimmed at the current focus? A node is dimmed when
 * a focus set is active and it is not a member. Returns a plain boolean so
 * zustand re-renders the subscribing node ONLY when its own dimmed state flips.
 */
export function selectDimmed(id: string) {
  return (s: FocusState): boolean => s.highlightIds !== null && !s.highlightIds.has(id);
}
