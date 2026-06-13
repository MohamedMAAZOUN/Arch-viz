// ============================================================================
// resolve — pure function: ProjectDocument × layer × mvp → effective state
// ============================================================================
// Per the schema README's "Resolving the model at runtime" section.
// Pure, memoizable.
//
// Used by the Canvas to know what to render, and by the Inspector to know
// the effective property values at the current view.
//
// Containment (hierarchical view): the resolver also decides which elements
// act as expanded *containers* and which are *collapsed*. Two systems feed
// the decision and are merged here, in one place:
//
//   1. Layer-driven default — a `group` whose `aggregateAt` includes the
//      current layer defaults to COLLAPSED; everything else defaults to
//      EXPANDED. (This subsumes the old aggregation behaviour.)
//   2. User-driven override — an explicit expand/collapse choice from the
//      view state always wins over the default.
//
// A collapsed element hides its entire subtree (ancestor-aware, any depth).
// Cross-boundary edges whose endpoints fall inside a collapsed subtree are
// rerouted up to the nearest visible ancestor instead of being dropped.
// ============================================================================

import type {
  Connection,
  ConnectionType,
  Element,
  LayerId,
  MvpRef,
  ProjectDocument,
  Tone,
} from "@arch-vis/schema";

/** Per-element containment metadata, derived for the current view. */
export interface Containment {
  /** Nearest *visible* ancestor element id, or null when top-level. */
  parentId: string | null;
  /** True when this element has children that are gated-in at this view —
   *  i.e. it can be expanded/collapsed and should show a chevron. */
  canExpand: boolean;
  /** Effective expand state (default merged with user override). Only
   *  meaningful when `canExpand` is true. */
  isExpanded: boolean;
  /** True when this element currently renders as a container (it is expanded
   *  AND at least one child is visible inside it). */
  hasVisibleChildren: boolean;
}

/**
 * A canvas-ready edge. Unlike a raw {@link Connection}, its endpoints are
 * remapped to whatever is *visible* (a collapsed group stands in for its
 * hidden children), and parallel edges collapsed by that remapping are
 * aggregated into one.
 */
export interface ResolvedEdge {
  id: string;
  from: string;
  to: string;
  type: ConnectionType;
  protocol?: string;
  tone?: Tone;
  /** True when this edge stands in for ≥1 connection rerouted to an ancestor. */
  aggregated: boolean;
  /** How many underlying connections this edge represents. */
  count: number;
}

export interface ResolvedState {
  /** Visible elements at this (layer, mvp), collapse applied. */
  elements: readonly Element[];
  /** Real connections whose *both* endpoints are themselves visible. Used by
   *  the inspector's Dependencies section — never rerouted. */
  connections: readonly Connection[];
  /** Canvas-ready edges, with cross-boundary endpoints rerouted to the nearest
   *  visible ancestor and parallel edges aggregated. */
  edges: readonly ResolvedEdge[];
  /** Per-element containment metadata keyed by element id. */
  containment: ReadonlyMap<string, Containment>;
}

/** User expand/collapse overrides keyed by element id (view state). */
export type GroupExpansion = Readonly<Record<string, boolean>>;

/**
 * Compute which elements and connections are visible — and with what
 * resolved properties and containment — at the given (layer, mvp).
 *
 * `expansion` carries the user's explicit expand/collapse overrides; omit it
 * for the pure layer-driven default (the historical aggregation behaviour).
 */
export function resolve(
  doc: ProjectDocument,
  layer: LayerId,
  mvpId: MvpRef,
  expansion: GroupExpansion = {},
  defaultCollapsed = false,
): ResolvedState {
  // Pre-compute O(1) lookup maps — avoids O(n) linear scans inside the
  // per-element and per-connection loops (was O(N×M) before).
  const layerOrderMap = new Map<string, number>(doc.layers.map((l) => [l.id, l.order]));
  const mvpOrderMap = new Map<string, number>(doc.mvps.map((m) => [m.id, m.order]));
  const elementById = new Map<string, Element>(doc.elements.map((e) => [e.id, e]));

  const layerOrder = layerOrderMap.get(layer) ?? 0;
  const mvpOrder = mvpOrderMap.get(mvpId) ?? 0;

  // 1. Which elements pass their own mvp + layer gating, independent of
  //    containment. "Gated-in" elements exist at this view; whether they are
  //    *visible* additionally depends on their ancestors' collapse state.
  const gatedInIds = new Set<string>();
  for (const el of doc.elements) {
    if (elementGatedIn(el, layerOrder, mvpOrder, layerOrderMap, mvpOrderMap)) {
      gatedInIds.add(el.id);
    }
  }

  // 2. Which gated-in elements have ≥1 gated-in child (can be containers).
  const childCount = new Map<string, number>();
  for (const el of doc.elements) {
    if (!gatedInIds.has(el.id) || el.parent === undefined) continue;
    childCount.set(el.parent, (childCount.get(el.parent) ?? 0) + 1);
  }

  // 3. Effective expand state per element, and the set of collapsed elements.
  const collapsed = new Set<string>();
  for (const el of doc.elements) {
    if (!gatedInIds.has(el.id) || (childCount.get(el.id) ?? 0) === 0) continue;
    if (!isExpanded(el, layer, expansion, defaultCollapsed)) collapsed.add(el.id);
  }

  // 4. Visible = gated-in AND no collapsed ancestor anywhere up the chain.
  const visibleIds = new Set<string>();
  for (const id of gatedInIds) {
    if (!hasCollapsedAncestor(id, elementById, collapsed)) visibleIds.add(id);
  }

  const visibleElements: Element[] = [];
  for (const el of doc.elements) {
    if (visibleIds.has(el.id)) visibleElements.push(resolveElementAt(el, mvpOrder, mvpOrderMap));
  }

  // 5. Containment metadata for every visible element.
  const containment = new Map<string, Containment>();
  for (const el of visibleElements) {
    const childIds = childCount.get(el.id) ?? 0;
    const expanded = childIds > 0 ? isExpanded(el, layer, expansion, defaultCollapsed) : false;
    containment.set(el.id, {
      parentId: nearestVisibleAncestor(el.id, elementById, visibleIds),
      canExpand: childIds > 0,
      isExpanded: expanded,
      hasVisibleChildren: expanded,
    });
  }

  // 6. Connections — the "real" set (both endpoints visible) for the inspector.
  const visibleConnections: Connection[] = [];
  for (const c of doc.connections) {
    if (!connectionGatedIn(c, layerOrderMap, layerOrder, mvpOrder, mvpOrderMap)) continue;
    if (visibleIds.has(c.from) && visibleIds.has(c.to)) visibleConnections.push(c);
  }

  // 7. Canvas edges — reroute cross-boundary endpoints to a visible ancestor.
  const edges = buildEdges(
    doc.connections,
    { layerOrderMap, layerOrder, mvpOrder, mvpOrderMap },
    gatedInIds,
    visibleIds,
    elementById,
  );

  return { elements: visibleElements, connections: visibleConnections, edges, containment };
}

// ----------------------------------------------------------------------------
// Expansion / containment helpers
// ----------------------------------------------------------------------------

/** Effective expand state: explicit override wins over the layer default. */
function isExpanded(
  el: Element,
  layer: LayerId,
  expansion: GroupExpansion,
  defaultCollapsed: boolean,
): boolean {
  const override = expansion[el.id];
  if (override !== undefined) return override;
  if (el.type === "group") {
    // With the "collapse subsystems by default" preference on, every group
    // starts collapsed (a clean overview); otherwise only groups that declare
    // they aggregate at this layer collapse.
    if (defaultCollapsed) return false;
    if (el.aggregateAt.includes(layer)) return false;
  }
  return true;
}

/** Walk the parent chain; true if any ancestor is in the collapsed set. */
function hasCollapsedAncestor(
  id: string,
  elementById: ReadonlyMap<string, Element>,
  collapsed: ReadonlySet<string>,
): boolean {
  let parent = elementById.get(id)?.parent;
  const seen = new Set<string>(); // guard against malformed cycles (schema forbids them)
  while (parent !== undefined && !seen.has(parent)) {
    if (collapsed.has(parent)) return true;
    seen.add(parent);
    parent = elementById.get(parent)?.parent;
  }
  return false;
}

/** Nearest ancestor (excluding self) that is visible, or null if top-level. */
function nearestVisibleAncestor(
  id: string,
  elementById: ReadonlyMap<string, Element>,
  visibleIds: ReadonlySet<string>,
): string | null {
  let parent = elementById.get(id)?.parent;
  const seen = new Set<string>();
  while (parent !== undefined && !seen.has(parent)) {
    if (visibleIds.has(parent)) return parent;
    seen.add(parent);
    parent = elementById.get(parent)?.parent;
  }
  return null;
}

/**
 * Map an element id to whatever is visible for it: itself if visible, else the
 * nearest visible ancestor (collapsed groups stand in for their subtree). Null
 * when the element is gated-out entirely (truly absent at this view).
 */
function visibleEndpoint(
  id: string,
  gatedInIds: ReadonlySet<string>,
  visibleIds: ReadonlySet<string>,
  elementById: ReadonlyMap<string, Element>,
): string | null {
  if (!gatedInIds.has(id)) return null; // absent for mvp/layer reasons → drop
  if (visibleIds.has(id)) return id;
  return nearestVisibleAncestor(id, elementById, visibleIds);
}

// ----------------------------------------------------------------------------
// Edge rerouting / aggregation
// ----------------------------------------------------------------------------

interface ViewGating {
  layerOrderMap: ReadonlyMap<string, number>;
  layerOrder: number;
  mvpOrder: number;
  mvpOrderMap: ReadonlyMap<string, number>;
}

function buildEdges(
  connections: readonly Connection[],
  gating: ViewGating,
  gatedInIds: ReadonlySet<string>,
  visibleIds: ReadonlySet<string>,
  elementById: ReadonlyMap<string, Element>,
): readonly ResolvedEdge[] {
  // Accumulate by remapped endpoint pair so parallel edges collapse into one.
  const byPair = new Map<string, ResolvedEdge>();

  for (const c of connections) {
    if (
      !connectionGatedIn(
        c,
        gating.layerOrderMap,
        gating.layerOrder,
        gating.mvpOrder,
        gating.mvpOrderMap,
      )
    ) {
      continue;
    }

    const from = visibleEndpoint(c.from, gatedInIds, visibleIds, elementById);
    const to = visibleEndpoint(c.to, gatedInIds, visibleIds, elementById);
    if (from === null || to === null) continue; // an endpoint is truly absent
    if (from === to) continue; // collapsed to a self-loop inside one container

    const rerouted = from !== c.from || to !== c.to;
    const key = `${from} ${to}`;
    const existing = byPair.get(key);

    if (existing === undefined) {
      byPair.set(key, {
        // 1:1 edges keep their stable connection id; aggregated ones get a
        // deterministic synthetic id so React Flow keys stay stable.
        id: rerouted ? `agg:${from}->${to}` : c.id,
        from,
        to,
        type: c.type,
        ...(c.protocol !== undefined ? { protocol: c.protocol } : {}),
        ...(c.style?.tone !== undefined ? { tone: c.style.tone } : {}),
        aggregated: rerouted,
        count: 1,
      });
    } else {
      existing.count += 1;
      existing.aggregated = true;
      existing.id = `agg:${from}->${to}`;
    }
  }

  return [...byPair.values()];
}

// ----------------------------------------------------------------------------
// Gating helpers (mvp + layer, independent of containment)
// ----------------------------------------------------------------------------

function elementGatedIn(
  el: Element,
  layerOrder: number,
  mvpOrder: number,
  layerOrderMap: ReadonlyMap<string, number>,
  mvpOrderMap: ReadonlyMap<string, number>,
): boolean {
  // MVP gating — unknown ids use Infinity so orphaned introducedIn refs
  // never accidentally make an element visible (fail-safe direction).
  if ((mvpOrderMap.get(el.lifecycle.introducedIn) ?? Infinity) > mvpOrder) return false;
  if (
    el.lifecycle.removedIn !== undefined &&
    (mvpOrderMap.get(el.lifecycle.removedIn) ?? Infinity) <= mvpOrder
  ) {
    return false;
  }
  // Layer gating
  if ((layerOrderMap.get(el.minLayer) ?? 0) > layerOrder) return false;
  return true;
}

function connectionGatedIn(
  c: Connection,
  layerOrderMap: ReadonlyMap<string, number>,
  layerOrder: number,
  mvpOrder: number,
  mvpOrderMap: ReadonlyMap<string, number>,
): boolean {
  if ((mvpOrderMap.get(c.lifecycle.introducedIn) ?? Infinity) > mvpOrder) return false;
  if (
    c.lifecycle.removedIn !== undefined &&
    (mvpOrderMap.get(c.lifecycle.removedIn) ?? Infinity) <= mvpOrder
  ) {
    return false;
  }
  if ((layerOrderMap.get(c.minLayer) ?? 0) > layerOrder) return false;
  return true;
}

/** Apply lifecycle.modifiedIn patches up to mvpOrder. */
function resolveElementAt(
  el: Element,
  mvpOrder: number,
  mvpOrderMap: ReadonlyMap<string, number>,
): Element {
  if (el.lifecycle.modifiedIn === undefined) return el;

  // Apply patches whose MVP order is ≤ current mvpOrder, in ascending order.
  // Unknown MVP ids get Infinity so orphaned modifiedIn entries are never applied.
  const patches = Object.entries(el.lifecycle.modifiedIn)
    .filter(([mvpId]) => (mvpOrderMap.get(mvpId) ?? Infinity) <= mvpOrder)
    .sort((a, b) => (mvpOrderMap.get(a[0]) ?? Infinity) - (mvpOrderMap.get(b[0]) ?? Infinity));

  if (patches.length === 0) return el;

  // Shallow-merge the properties of each patch into a fresh element copy.
  let merged: Element = el;
  for (const [, patch] of patches) {
    merged = {
      ...merged,
      properties: { ...merged.properties, ...patch.properties },
    };
  }
  return merged;
}
