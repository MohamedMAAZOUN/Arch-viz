// ============================================================================
// resolve — pure function: ProjectDocument × layer × mvp → effective state
// ============================================================================
// Per the schema README's "Resolving the model at runtime" section.
// Pure, memoizable.
//
// Used by the Canvas to know what to render, and by the Inspector to know
// the effective property values at the current view.
// ============================================================================

import type { Connection, Element, LayerId, MvpRef, ProjectDocument } from "@/core/schema/schema";

export interface ResolvedState {
  elements: readonly Element[];
  connections: readonly Connection[];
}

/**
 * Compute which elements and connections are visible — and with what
 * resolved properties — at the given (layer, mvp).
 */
export function resolve(doc: ProjectDocument, layer: LayerId, mvpId: MvpRef): ResolvedState {
  // Pre-compute O(1) lookup maps — avoids O(n) linear scans inside the
  // per-element and per-connection loops (was O(N×M) before).
  const layerOrderMap = new Map<string, number>(doc.layers.map((l) => [l.id, l.order]));
  const mvpOrderMap = new Map<string, number>(doc.mvps.map((m) => [m.id, m.order]));

  const layerOrder = layerOrderMap.get(layer) ?? 0;
  const mvpOrder = mvpOrderMap.get(mvpId) ?? 0;

  const aggregatingParents = aggregatingParentsAtLayer(doc, layer);

  const visibleElements: Element[] = [];
  for (const el of doc.elements) {
    if (!elementVisibleAt(el, layerOrder, mvpOrder, layerOrderMap, mvpOrderMap, aggregatingParents))
      continue;
    visibleElements.push(resolveElementAt(el, mvpOrder, mvpOrderMap));
  }

  const visibleIds = new Set(visibleElements.map((e) => e.id));
  const visibleConnections: Connection[] = [];
  for (const c of doc.connections) {
    if (!connectionVisibleAt(c, layerOrderMap, layerOrder, mvpOrder, mvpOrderMap, visibleIds))
      continue;
    visibleConnections.push(c);
  }

  return { elements: visibleElements, connections: visibleConnections };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Set of parent ids whose children should be hidden at this layer. */
function aggregatingParentsAtLayer(doc: ProjectDocument, layer: LayerId): Set<string> {
  const ids = new Set<string>();
  for (const el of doc.elements) {
    if (el.type === "group" && el.aggregateAt.includes(layer)) {
      ids.add(el.id);
    }
  }
  return ids;
}

function elementVisibleAt(
  el: Element,
  layerOrder: number,
  mvpOrder: number,
  layerOrderMap: ReadonlyMap<string, number>,
  mvpOrderMap: ReadonlyMap<string, number>,
  aggregatingParents: Set<string>,
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
  // Aggregation: hidden if parent aggregates at this layer
  if (el.parent !== undefined && aggregatingParents.has(el.parent)) return false;
  return true;
}

function connectionVisibleAt(
  c: Connection,
  layerOrderMap: ReadonlyMap<string, number>,
  layerOrder: number,
  mvpOrder: number,
  mvpOrderMap: ReadonlyMap<string, number>,
  visibleIds: Set<string>,
): boolean {
  if ((mvpOrderMap.get(c.lifecycle.introducedIn) ?? Infinity) > mvpOrder) return false;
  if (
    c.lifecycle.removedIn !== undefined &&
    (mvpOrderMap.get(c.lifecycle.removedIn) ?? Infinity) <= mvpOrder
  ) {
    return false;
  }
  if ((layerOrderMap.get(c.minLayer) ?? 0) > layerOrder) return false;
  if (!visibleIds.has(c.from) || !visibleIds.has(c.to)) return false;
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
