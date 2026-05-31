# ADR-0003 — Nested node containment (hierarchical view)

## Status

Accepted · May 31, 2026

## Context

The schema has always modelled hierarchy — every element may have a `parent`,
`group` is an element type, and `group.aggregateAt` lists the layers at which a
group should hide its children. But the canvas rendered **flat**: when a group
was not aggregating, `resolve()` still emitted its children as independent
peers and ELK laid them out side-by-side. React Flow's first-class sub-flow
support (`parentId` + `extent:"parent"`) was not wired at all.

Nesting is the primary tool for taming visual complexity (the 280-node scale
test is spaghetti when flat) and it matches how architects think
(cluster → node → pod; domain → service → data). It is table-stakes for tools
in this space (Ilograph, Structurizr). See issue #1.

Two hiding systems had to be reconciled: the existing **layer-driven**
`aggregateAt` (automatic) and a new **user-driven** expand/collapse (manual).

## Decision

Render containment by making `resolve()` containment-aware and wiring React
Flow's sub-flow model. No schema change — `parent`/`group`/`aggregateAt`
already existed.

**One expansion model, merged in `resolve()`.** An element is expanded or
collapsed by combining:

1. a **layer-driven default** — a `group` whose `aggregateAt` includes the
   current layer defaults to collapsed; everything else defaults to expanded
   (this subsumes the old aggregation behaviour exactly), and
2. a **user override** — an explicit per-element choice in view state
   (`viewStore.groupExpansion`) that always wins.

A collapsed element hides its **entire subtree** (ancestor-aware, any depth).
Collapse is allowed on *any* element with gated-in children, not just groups —
so a `service` with nested `database`s can be opened/closed too. This is what
makes the acceptance-criterion 3-level nesting (domain → service → data) work.

**`resolve()` now returns containment + canvas edges.** Alongside the visible
`elements` and the real `connections` (both endpoints visible — used by the
inspector), it returns:

- `containment` — per element: `parentId` (nearest *visible* ancestor),
  `canExpand`, `isExpanded`, `hasVisibleChildren`.
- `edges` — canvas-ready edges with **cross-boundary endpoints rerouted** to
  the nearest visible ancestor. A connection into a collapsed group becomes a
  group-to-group edge; parallel edges collapsed by rerouting are aggregated
  into one (with a count). Edges whose endpoints are truly absent (gated out by
  MVP/layer) are dropped, as before.

**Nested ELK layout.** The layout engine contract now takes a *tree* of
`LayoutNode`s and returns a flat map of `LayoutResultNode`s carrying
parent-relative position, size, and `parentId`. The worker builds a recursive
ELK graph with `elk.hierarchyHandling: INCLUDE_CHILDREN` (one pass, edges may
cross boundaries) and reserves header room via per-container `elk.padding`.
Containers are sized by ELK to fit their children.

**Canvas mapping.** `useLayoutedGraph` resolves the maximal element set (latest
MVP) with the same expansion overrides, builds the tree (`buildLayoutTree`),
and exposes placements with **both** parent-relative and absolute coordinates.
The canvas renders an expanded element as a `GroupNode` container and its
children as sub-flow nodes (`parentId` + `extent:"parent"`); a collapsed
element renders as a normal `ElementNode` with an expand chevron. When MVP
scrubbing hides an intermediate container, the child falls back to an absolute,
top-level placement. Re-layout runs on expand/collapse (it changes the visible
set); a CSS transition on the node transform animates the reflow.

## Consequences

What gets easier:
- Large graphs become legible: collapse a domain to a single box, open it to
  see inside, at any depth.
- One place (`resolve()`) decides visibility, containment, and edge routing —
  pure and unit-tested.
- `aggregateAt` is preserved as the *default* driver of expansion, so existing
  documents and tests behave identically until a user toggles something.

What gets harder / what we accept:
- **Re-layout on every expand/collapse.** Nested ELK at the 282-node scale test
  measured ~0.7s in the spike (comparable to the prior flat layout). Usable, but
  it pairs with the layout-performance work; incremental/cached nested layout is
  a follow-up.
- Manual expand/collapse overrides are global per session (not per layer) and
  are cleared on project load. A per-layer override model can come later.
- Position overrides for nested nodes are stored relative to the layout parent;
  the absolute coordinate is re-accumulated on merge. Moving a node between
  parents is out of scope for v1.

## Alternatives considered

- **Manual-only or automatic-only expansion.** Rejected: automatic alone can't
  express "open this one box"; manual alone throws away the `aggregateAt`
  signal the schema already carries. The merged model keeps both.
- **Hiding cross-boundary edges instead of rerouting.** Rejected: it loses the
  signal that a collapsed group talks to the outside. Rerouting to the visible
  ancestor keeps the topology honest.
- **Capping nesting depth.** Rejected: the acceptance criteria require ≥3 levels
  and the data model is unbounded; collapse is the complexity lever, not a cap.
- **Laying out only the current-MVP set.** Rejected: it would reshuffle the
  diagram on every MVP scrub. We keep the established "lay out the maximal set"
  rule and reconcile current vs maximal containment via absolute coordinates.
