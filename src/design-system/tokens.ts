// ============================================================================
// Architecture Visualizer — Design Tokens (TS mirror)
// ============================================================================
// CSS is the single source of truth for COLORS and SPACING. This file mirrors
// only the tokens that JS code needs to consume directly — Motion durations,
// easing curves, z-indexes, breakpoints. They duplicate the values in
// tokens.css; keep them in sync.
//
// Rationale: Motion accepts numbers (ms) and bezier tuples, not CSS strings.
// Pulling these values out of computed styles at runtime is fragile and slow.
// ============================================================================

// -- Motion ------------------------------------------------------------------

/** Durations in milliseconds — direct input to Motion's `duration` field. */
export const duration = {
  instant: 50, // micro feedback (tap, focus ring)
  fast: 150, // hover, button press, menu open
  base: 250, // panel slides, layer toggle
  slow: 450, // MVP scrub, layout reshuffle
  cinematic: 800, // tour camera moves
} as const;

export type DurationKey = keyof typeof duration;

/** Cubic-bezier easings as tuples — direct input to Motion's `ease` field. */
export const ease = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
  emphasized: [0.2, 0, 0, 1] as [number, number, number, number],
  anticipate: [0.36, 0, 0.66, -0.56] as [number, number, number, number],
} as const;

export type EaseKey = keyof typeof ease;

/** Spring presets for Motion. The MVP slider and layout animations use these. */
export const spring = {
  /** Crisp, controlled — for UI elements with intent. */
  crisp: { type: "spring", stiffness: 320, damping: 32, mass: 0.8 },
  /** Soft, expressive — for hero moments, MVP transitions. */
  soft: { type: "spring", stiffness: 180, damping: 28, mass: 1.0 },
  /** Bouncy — for celebration / confirmation feedback. */
  bouncy: { type: "spring", stiffness: 220, damping: 12, mass: 0.6 },
  /** Slow, cinematic — tour camera moves. */
  cinema: { type: "spring", stiffness: 60, damping: 22, mass: 1.4 },
} as const;

// -- Z-index ladder ----------------------------------------------------------

export const z = {
  canvas: 0,
  canvasControls: 10,
  inspector: 20,
  topbar: 30,
  mvpSlider: 40,
  tourOverlay: 50,
  dialog: 100,
  toast: 200,
  tooltip: 300,
} as const;

// -- Breakpoints (for use in matchMedia / responsive logic in JS) ------------

export const breakpoint = {
  sm: 640,
  md: 1024,
  lg: 1440,
  xl: 1920,
  "2xl": 2560,
} as const;

// -- Golden ratio constants --------------------------------------------------

export const ratio = {
  /** φ - the golden ratio itself */
  phi: 1.61803398875,
  /** Larger part — 1/φ */
  major: 0.61803398875,
  /** Smaller part — 1/φ² */
  minor: 0.38196601125,
} as const;

// -- MVP palette (for direct access by canvas renderer) ----------------------
// Mirrors --color-mvp-1..8 in tokens.css. Used when canvas needs to color
// elements by their MVP origin in overlay/diff mode.

export const mvpColors = [
  "oklch(72% 0.17 250)", // mvp-1 blue
  "oklch(76% 0.16 70)", // mvp-2 amber
  "oklch(72% 0.19 145)", // mvp-3 green
  "oklch(70% 0.21 350)", // mvp-4 magenta
  "oklch(76% 0.17 195)", // mvp-5 teal
  "oklch(70% 0.21 30)", // mvp-6 coral
  "oklch(74% 0.18 115)", // mvp-7 lime
  "oklch(70% 0.18 295)", // mvp-8 purple
] as const;

/**
 * Get the MVP color by index. Wraps around if more than 8 MVPs exist
 * (rare but defensive). The modulo guarantees a valid index, so the
 * tuple access is non-null by construction.
 */
export function mvpColor(index: number): string {
  // Safe: index is constrained to [0, mvpColors.length-1] by the modulo.
  const color = mvpColors[index % mvpColors.length];
  // Type narrowing for noUncheckedIndexedAccess; this can never throw.
  if (color === undefined) {
    throw new Error("mvpColor: empty palette");
  }
  return color;
}

// -- Convenience: shorthand getters for theme tokens via CSS custom props -----
// At runtime, components should prefer `var(--color-...)` inside CSS.
// Use these only when you need a token value from JS (rare).

export function cssVar(name: string): string {
  return `var(--${name})`;
}
