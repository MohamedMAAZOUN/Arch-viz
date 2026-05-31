# ADR-0004 — Guided tour playback

## Status

Accepted · May 31, 2026

## Context

The schema has always defined `tours` (named, ordered `steps`, each with a
`viewpoint`, optional `caption`, optional `highlight` ids, and a `duration`),
but nothing consumed them and `src/features/tour/` was empty. Guided playback —
the "Prezi-feel" camera tour across a diagram — is the differentiator that
motivated the project (issue #2). The design system already reserved a
`--z-tour-overlay`, a `cinematic` duration, and a `cinema` spring for it.

## Decision

Add a `tour` feature plus a playback store, splitting responsibilities along
the existing wrapper boundary: the **Canvas owns the camera and node dimming**
(it's the only file that may touch React Flow), and everything else is
view-state + presentation.

**State — `core/state/tourStore.ts`.** A tier-2 Zustand store holding
`activeTourId`, `stepIndex`, `stepCount`, `isPlaying`. Actions: `start`,
`exit`, `next` (stops at the last step — no loop), `prev`, `goTo`, `setPlaying`,
`togglePlay`. `stepCount` is captured on `start` so clamping never needs the
document. It's its own store so canvas/panels re-render on tour changes only.

**Camera — in the Canvas.** A pure `resolveCameraAction(viewpoint)` maps a
`Viewpoint` to a `CameraAction` discriminated union (`fitAll` / `focus` /
`center` / `none`) with a clear precedence (`fit:"all"` > `focus` >
`fit:"focus"` fallback > explicit `x/y` > nothing). The Canvas maps that action
onto its React Flow instance (`fitView` / `setCenter`) with the `cinematic`
duration — or `0` under `prefers-reduced-motion` (a jump). A step's `layer` /
`mvp` overrides are applied to `viewStore` first; the camera move is scheduled
a tick later so freshly-revealed nodes exist before it frames them.

**Dimming.** The active step's `highlight` set (when non-empty) dims every node
and edge it doesn't include, via a `dimmed` flag on node data and reduced edge
opacity. No highlight → nothing dims.

**Save / restore.** On entering a tour the Canvas snapshots the viewport,
selection, layer, and MVP, and clears the selection; on exit it restores them
(viewport animated). The snapshot effect is declared *before* the camera effect
so the snapshot captures the pre-tour view, not the first step's overrides.

**UI.** `TourLauncher` is a frosted pill (top-right of the stage) listing the
tours, shown only when `doc.tours` is non-empty and no tour is active. It's
mounted from `App` (the composition root) rather than the TopBar/inspector, to
avoid a sibling-feature import. `TourPlayer` is the focused overlay (caption +
prev/play-pause/next/step-dots/exit) and owns the auto-advance timer (per-step
`duration`, capped under reduced motion) and the keyboard (Space/→/↓ advance,
←/↑ back, Esc exit). It's mounted lazily via `TourMount` (code-split — dead
weight until a tour starts, per the performance guide). While a tour plays,
`FloatingPanels` returns `null` so the chrome minimizes.

## Consequences

What gets easier:
- Tours are now a first-class, testable feature: the camera decision and the
  playback state machine are pure/unit-tested; React Flow stays sealed in the
  Canvas.
- Loading a project exits any running tour (`loadProject`), so playback never
  outlives its document.

What we accept:
- The camera effect re-runs if the document changes mid-tour (benign re-frame);
  editing during playback is not a real workflow.
- `viewpoint.x/y` are treated as world coordinates for `setCenter`; the example
  tours rely on `focus` + `fit`, which are the robust paths.
- Manual stepping doesn't pause auto-play; the timer simply restarts from the
  new step. Pause is an explicit control.

## Alternatives considered

- **Picker in the TopBar / inspector** (as the issue suggested). Rejected to
  respect the repo's no-sibling-feature-imports convention; mounting a floating
  launcher from `App` keeps the boundary clean and matches the floating-panel
  style already in use.
- **Looping playback.** Rejected for v1 (chosen with the user): stop at the
  last step is the less surprising default; looping can be a later toggle.
- **Driving the camera from the player overlay.** Rejected — only the Canvas
  may import React Flow. The player drives state; the Canvas reacts.
