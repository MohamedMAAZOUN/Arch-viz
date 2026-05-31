// ============================================================================
// tourStore — guided-tour playback position (view state, tier 2)
// ============================================================================
// Which tour is playing, which step we're on, and whether the timer is
// running. Pure state + actions; the camera move, node dimming, and
// layer/MVP overrides are applied by the Canvas (which owns React Flow) and
// the TourPlayer overlay (which owns the timer and keyboard). Kept in its own
// store so canvas/panels only re-render on tour changes, not every click.
//
// `stepCount` is captured on start() so next()/goTo() can clamp without
// reaching for the document.
// ============================================================================

import { create } from "zustand";

export interface TourState {
  activeTourId: string | null;
  stepIndex: number;
  stepCount: number;
  isPlaying: boolean;

  /** Enter a tour at step 0 and start the timer. */
  start: (tourId: string, stepCount: number) => void;
  /** Leave the tour entirely (the Canvas restores the prior view). */
  exit: () => void;
  /** Advance one step; stops the timer (does not loop) on the last step. */
  next: () => void;
  /** Go back one step (clamped at the first). */
  prev: () => void;
  /** Jump to a specific step (clamped to range). */
  goTo: (index: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
}

export const useTourStore = create<TourState>((set) => ({
  activeTourId: null,
  stepIndex: 0,
  stepCount: 0,
  isPlaying: false,

  start: (tourId, stepCount) => {
    set({ activeTourId: tourId, stepIndex: 0, stepCount, isPlaying: true });
  },
  exit: () => {
    set({ activeTourId: null, stepIndex: 0, stepCount: 0, isPlaying: false });
  },
  next: () => {
    set((s) => {
      if (s.activeTourId === null) return s;
      if (s.stepIndex >= s.stepCount - 1) return { isPlaying: false };
      return { stepIndex: s.stepIndex + 1 };
    });
  },
  prev: () => {
    set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) }));
  },
  goTo: (index) => {
    set((s) => ({ stepIndex: Math.max(0, Math.min(s.stepCount - 1, index)) }));
  },
  setPlaying: (isPlaying) => {
    set({ isPlaying });
  },
  togglePlay: () => {
    set((s) => ({ isPlaying: !s.isPlaying }));
  },
}));
