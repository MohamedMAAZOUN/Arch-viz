// ============================================================================
// prefersReducedMotion — does the user want motion minimized?
// ============================================================================
// A pure read of the OS/browser setting. Call it inside effects and event
// handlers (never in a render path) to decide whether to animate a camera
// move / tour advance or jump instantly. CSS handles its own reduced-motion
// zeroing via tokens; this is for the JS-driven moves CSS can't reach.
// ============================================================================

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
