# ADR-0011 — Per-layer manual position overrides

## Status

Accepted · June 6, 2026

## Context

The same element appears at multiple layers (business / architecture /
engineering), but each layer shows a different *subset* of the graph and reads
best with a different arrangement. A node hand-placed to look right among its
business-layer neighbours is usually in the wrong spot once the architecture
layer reveals a dozen more nodes around it. So "where did the user drag this?"
cannot be a single answer — it has to be answered *per layer*.

Stage 2 of the layout pipeline (ADR-0009) merges manual overrides on top of
auto-layout. This ADR records how those overrides are *modelled and stored*.

## Decision

**Manual positions are stored per layer**, in the document's `layout` block:

```ts
PerLayerLayout = {
  business?:     Record<ElementId, { position?, size? }>
  architecture?: Record<ElementId, { position?, size? }>
  engineering?:  Record<ElementId, { position?, size? }>
}
```

Every level is optional: omit a layer and that whole layer falls back to full
auto-layout; within a layer, omit an element and it falls back to its
auto-layout position. Positions are stored **parent-relative**, exactly as React
Flow reports a dragged node, so they drop straight into the sub-flow model.

**Only manual overrides are persisted.** Auto-layout output is recomputed at
runtime from the current topology and never written to the document — so it can
never go stale, and the saved file stays small and diff-friendly (a handful of
nudged coordinates, not the whole graph).

**Writes go through `DocStore`:**
- `setElementLayoutOverride(layer, elementId, position)` — `null` clears one
  element's override (snapping it back to auto-layout).
- `clearLayerOverrides(layer)` — the "Reorganize" action; wipes every override
  for the current layer so it re-auto-lays-out from scratch.

A drag on the canvas commits one `setElementLayoutOverride` for the **current**
layer. Switching layers reads a different slice of `layout`, so the two
arrangements never interfere.

## Consequences

What gets easier:
- Each layer can be tuned independently; tuning one never disturbs another.
- "Reorganize" is a single, layer-scoped, undoable operation.
- The persisted document carries only intentional human placement; everything
  else is derived, so topology changes can't leave stale coordinates behind.

What we accept:
- A node dragged at one layer is **not** moved at the others — by design, but it
  can surprise a user who expects a global "this is where this lives." The
  per-layer model is the right default for a layered tool; a future "apply to all
  layers" affordance could be layered on top without a schema change.
- `size` is modelled alongside `position` for symmetry, but v1 only writes
  `position`; manual resize is a later addition the schema already admits.

## Alternatives considered

- **One global position per element.** Rejected — a placement that reads well at
  one layer is wrong at another (different visible subset). This is the core
  reason the override is keyed by layer.
- **Persisting auto-layout alongside overrides.** Rejected — bloats the document
  and goes stale on any topology change (see ADR-0009). Auto-layout is always
  recomputed; only overrides are saved.
- **Per-MVP positions.** Rejected — the diagram is laid out for the maximal set
  across MVPs (ADR-0009) so scrubbing time never reshuffles it; positions
  therefore belong to the layer, not the MVP.
