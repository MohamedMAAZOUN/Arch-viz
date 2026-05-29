// ============================================================================
// resolve — pure function: ProjectDocument × layer × mvp → effective state
// ============================================================================
// Per the schema README's "Resolving the model at runtime" section.
// Pure, memoizable, O(n) per call.
//
// Used by the Canvas to know what to render, and by the Inspector to know
// the effective property values at the current view.
// ============================================================================

import type {
  Connection,
  Element,
  LayerId,
  MvpRef,
  ProjectDocument,
} from "@/core/schema/schema";

export interface ResolvedState {
  elements: readonly Element[];
  connections: readonly Connection[];
}

/**
 * Compute which elements and connections are visible — and with what
 * resolved properties — at the given (layer, mvp).
 */
export function resolve(
  doc: ProjectDocument,
  layer: LayerId,
  mvpId: MvpRef,
): ResolvedState {
  const layerOrder = layerOrderOf(doc, layer);
  const mvpOrder = mvpOrderOf(doc, mvpId);

  const aggregatingParents = aggregatingParentsAtLayer(doc, layer);

  const visibleElements: Element[] = [];
  for (const el of doc.elements) {
    if (!elementVisibleAt(el, doc, layerOrder, mvpOrder, aggregatingParents)) continue;
    visibleElements.push(resolveElementAt(el, mvpOrder, doc));
  }

  const visibleIds = new Set(visibleElements.map((e) => e.id));
  const visibleConnections: Connection[] = [];
  for (const c of doc.connections) {
    if (!connectionVisibleAt(c, doc, layerOrder, mvpOrder, visibleIds)) continue;
    visibleConnections.push(c);
  }

  return { elements: visibleElements, connections: visibleConnections };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function layerOrderOf(doc: ProjectDocument, layerId: LayerId): number {
  const layer = doc.layers.find((l) => l.id === layerId);
  return layer?.order ?? 0;
}

function mvpOrderOf(doc: ProjectDocument, mvpId: MvpRef): number {
  const mvp = doc.mvps.find((m) => m.id === mvpId);
  return mvp?.order ?? 0;
}

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
  doc: ProjectDocument,
  layerOrder: number,
  mvpOrder: number,
  aggregatingParents: Set<string>,
): boolean {
  // MVP gating
  if (mvpOrderOf(doc, el.lifecycle.introducedIn) > mvpOrder) return false;
  if (el.lifecycle.removedIn !== undefined && mvpOrderOf(doc, el.lifecycle.removedIn) <= mvpOrder) {
    return false;
  }
  // Layer gating
  if (layerOrderOf(doc, el.minLayer) > layerOrder) return false;
  // Aggregation: hidden if parent aggregates at this layer
  if (el.parent !== undefined && aggregatingParents.has(el.parent)) return false;
  return true;
}

function connectionVisibleAt(
  c: Connection,
  doc: ProjectDocument,
  layerOrder: number,
  mvpOrder: number,
  visibleIds: Set<string>,
): boolean {
  if (mvpOrderOf(doc, c.lifecycle.introducedIn) > mvpOrder) return false;
  if (c.lifecycle.removedIn !== undefined && mvpOrderOf(doc, c.lifecycle.removedIn) <= mvpOrder) {
    return false;
  }
  if (layerOrderOf(doc, c.minLayer) > layerOrder) return false;
  if (!visibleIds.has(c.from) || !visibleIds.has(c.to)) return false;
  return true;
}

/** Apply lifecycle.modifiedIn patches up to mvpOrder. */
function resolveElementAt(el: Element, mvpOrder: number, doc: ProjectDocument): Element {
  if (el.lifecycle.modifiedIn === undefined) return el;

  // Apply patches in MVP order
  const patches = Object.entries(el.lifecycle.modifiedIn)
    .filter(([mvpId]) => mvpOrderOf(doc, mvpId) <= mvpOrder)
    .sort((a, b) => mvpOrderOf(doc, a[0]) - mvpOrderOf(doc, b[0]));

  if (patches.length === 0) return el;

  // Shallow-merge the properties of each patch into a fresh element copy.
  // We don't mutate the original element.
  let merged: Element = el;
  for (const [, patch] of patches) {
    merged = {
      ...merged,
      properties: { ...merged.properties, ...patch.properties },
    };
  }
  return merged;
}
