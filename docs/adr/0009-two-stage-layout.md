# ADR-0009 — Two-stage layout pipeline (auto-layout + override merge)

## Status

Accepted · June 6, 2026

## Context

The canvas needs a final pixel position for every visible node. Two forces pull
on that number:

1. **Auto-layout** — ELK arranges the whole graph. Expensive (async, in a
   worker — see ADR-0008) and depends only on *topology*.
2. **Manual placement** — the user drags a node; that position must stick and
   must survive unrelated edits (renaming a node, editing a property, scrubbing
   the MVP slider) without the diagram reshuffling under them.

Recomputing ELK on every keystroke or drag would be both slow and jarring
(positions would jump). We need a pipeline that separates the expensive,
topology-driven step from the cheap, per-render step.

## Decision

`useLayoutedGraph(doc, layer)` resolves placements in **two stages**:

**Stage 1 — Auto-layout (expensive, async, cached).** Build a layout tree from
the *maximal* element set at this layer — `resolve()` at the latest MVP — plus
the current expand/collapse state, and hand it to the ELK worker. The result is
**memoized on a topology hash** keyed by `(topology, layer, density, spacing,
expansion)`. It does **not** re-run when the user drags a node, edits a property,
or scrubs MVPs. A small FIFO cache (`LAYOUT_CACHE_LIMIT = 16`) makes revisiting a
laid-out combination instant — no ELK round-trip, no flash of stale positions.
`isLaying` is true only while a *fresh* (uncached) layout is in flight.

**Stage 2 — Override merge (cheap, synchronous).** For each visible element the
final parent-relative position is:

```
doc.layout[layer][id].position  ??  autoLayout[id]
```

**The manual override always wins.** This runs every render; it is a map lookup.

Two further design choices fall out of this:

- **Maximal-set layout.** Positions are computed once for the maximal element set
  across all MVPs. MVP scrubbing reveals/hides nodes but never moves the ones
  that stay — the diagram is stable through time.
- **Dual coordinates.** Each `Placement` carries both parent-relative `(x, y)`
  (for React Flow's `parentId` + `extent:"parent"` sub-flow model) **and**
  absolute `(absX, absY)`, so the canvas can fall back to top-level placement
  when an intermediate container is hidden by MVP scrubbing. Manual overrides are
  stored parent-relative — exactly as React Flow reports a dragged node.

## Consequences

What gets easier:
- Drag, rename, property edits, and MVP scrubbing are all cheap: they re-run only
  stage 2, never ELK.
- A revisited (layer, topology, density, spacing, expansion) is instant.
- Manual nudges are durable and layer-scoped (see ADR-0010 for *why* per-layer).

What we accept:
- A topology hash that must capture **everything** stage 1 depends on. Miss a
  dependency and you get a stale layout; over-include and you thrash the cache.
  This is the most delicate invariant in the canvas — treat the hash as the
  contract.
- The FIFO cache is intentionally dumb (oldest key evicted). Fine for the handful
  of layer/density combinations in play; revisit if that space grows.

## Alternatives considered

- **One stage — ELK on every change.** Rejected — slow and visually jumpy.
- **Persisting auto-layout output.** Rejected — it would bloat the document and
  go stale the moment the topology changes. Only *manual* overrides are persisted
  (ADR-0011); auto-layout is always recomputed from the current graph.
- **Per-MVP layout.** Rejected — would reshuffle the diagram as you scrub. The
  maximal-set approach keeps time scrubbing legible.
