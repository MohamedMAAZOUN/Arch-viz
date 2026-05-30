# ADR-0002 — Floating panel workspace (replacing the docked inspector)

## Status

Accepted · May 30, 2026

## Context

v1 shipped a single docked inspector on the right, sized by the golden ratio (≈38.2% of the viewport), with the view controls (layer toggle, MVP slider, reorganize) living in the TopBar. Two problems surfaced in real use:

- The docked column **pushed the canvas** and ate a large, fixed slice of horizontal space. On smaller windows it became a full-height overlay that covered the graph, and the show/hide affordance was easy to lose.
- The TopBar tried to hold app chrome **and** view controls in one non-wrapping row, which overflowed narrow viewports (see the responsive fix that preceded this).

The product is a diagramming tool — the graph is the point — so the UI should maximise canvas area and stay out of the way, matching the conventions of canvas tools (Figma, tldraw, Miro).

## Decision

Replace the docked inspector with **three frosted-glass panels that float over a full-bleed canvas**, never pushing it:

- **Top** — view controls (layer / MVP / reorganize). Moved out of the TopBar; these are view state and belong with the canvas.
- **Left** — navigator: project overview, search, diagnostics, MVP timeline (the former global inspector sections).
- **Right** — inspector for the selected element (the former element inspector sections).

Interaction model:

- Each panel is independently **pinnable**. Pinned = stays expanded, ignores outside-click / Esc. Unpinned = **peek-on-demand**: open from an edge pill, dismiss by clicking the canvas or pressing Esc.
- Collapsed affordances: left/right → a circular pill centred on the edge; top → a rounded rectangle pill centred under the navbar. The pill **morphs** into the panel via a shared Motion `layoutId` (respecting `prefers-reduced-motion`).
- The right inspector **follows selection** when unpinned: it appears when an element is selected and tucks away on deselect.
- Styling is frosted glass (`backdrop-filter: blur()` over a ~86%-opaque surface) so panels read as translucent without sacrificing legibility over a busy graph.

State:

- Panel **pinned** preference is persisted (uiStore, `persist` version 2). Panel **open/peek** state is ephemeral and derived from `pinned` on load.
- The old persisted shape (`inspectorOpen` / `inspectorWidth`) is dropped via a `migrate` step.

The TopBar keeps only app chrome: brand, open/save, undo-redo, settings.

## Consequences

What gets easier:
- The canvas is full-bleed; panels stay out of the way and the graph reads larger.
- The three-zone split matches editor conventions, so the layout is familiar.
- Each content area (navigator vs inspector) can evolve independently.

What gets harder / what we gave up:
- **Drag-to-resize was removed.** It didn't fit the floating/morph model cleanly; panels use sensible fixed widths (320px). May return as a follow-up.
- More UI state to reason about (three independent open/pin states) and outside-click/Esc handling per panel.
- Panels occlude part of the graph by design; mitigated by edge insets, slim widths, capped height with internal scroll, and easy collapse.

## Notes

- This does not contradict the five principles: panels are pure presentation reading view state from Zustand (`core/state/uiStore`), document state still flows through DocStore, and Motion is used directly (no wrapper needed, per the dependency study).
- The retired files: `features/inspector/Inspector.tsx`, `InspectorResizer.tsx`, `InspectorResizer.css`. The reusable sections (`sections/*`, `Inspector.css`) live on, now rendered inside the floating panels.
