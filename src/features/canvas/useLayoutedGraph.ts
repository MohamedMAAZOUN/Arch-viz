// ============================================================================
// useLayoutedGraph — final node positions for the canvas
// ============================================================================
// Two-stage pipeline:
//
//   1. Auto-layout (expensive, async, runs in a Web Worker).
//      Depends ONLY on the topology of the maximal element set at this layer.
//      Memoized on a topology hash so it does NOT re-run when the user just
//      drags a node or edits a property.
//
//   2. Override merge (cheap, sync).
//      For each visible element, the final position is:
//         doc.layout[layer][id].position   ?? autoLayout[id]
//      The manual override always wins.
//
// Critical design choice: positions are computed for the MAXIMAL set across
// all MVPs (resolve at the latest MVP). MVP scrubbing reveals/hides elements
// but never reshuffles the diagram.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import { resolve } from "@/core/doc/resolve";
import { elkLayoutEngine } from "@/core/layout/ElkLayoutEngine";
import { NODE_DIMENSIONS } from "@/features/canvas/types";

import type { LayerId, ProjectDocument } from "@/core/schema/schema";

export type PositionMap = ReadonlyMap<string, { x: number; y: number }>;

export function useLayoutedGraph(doc: ProjectDocument | null, layer: LayerId): PositionMap {
  const [autoPositions, setAutoPositions] = useState<PositionMap>(() => new Map());

  // Hash the topology so we re-run ELK only when the graph shape actually
  // changes (elements added/removed, connections added/removed, parent
  // relationships moved, aggregation config changed). Position overrides
  // and property edits do NOT contribute to the key.
  const topologyKey = useMemo(() => computeTopologyKey(doc, layer), [doc, layer]);
  const lastTopologyKey = useRef<string | null>(null);

  useEffect(() => {
    if (doc === null) {
      setAutoPositions(new Map());
      lastTopologyKey.current = null;
      return;
    }

    if (topologyKey === lastTopologyKey.current) return; // topology unchanged
    lastTopologyKey.current = topologyKey;

    const latestMvp = [...doc.mvps].sort((a, b) => b.order - a.order)[0];
    if (latestMvp === undefined) {
      setAutoPositions(new Map());
      return;
    }

    const maximal = resolve(doc, layer, latestMvp.id);

    const layoutNodes = maximal.elements.map((el) => {
      const dim = el.type === "group" ? NODE_DIMENSIONS.group : NODE_DIMENSIONS.default;
      return { id: el.id, width: dim.width, height: dim.height };
    });

    const layoutEdges = maximal.connections.map((c) => ({
      id: c.id,
      source: c.from,
      target: c.to,
    }));

    let cancelled = false;

    void elkLayoutEngine
      .layout(layoutNodes, layoutEdges, { direction: "DOWN" })
      .then((result) => {
        if (cancelled) return;
        setAutoPositions(result.positions);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Layout failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [doc, layer, topologyKey]);

  // Override merge — runs every render. Cheap; just a Map clone.
  return useMemo(() => {
    if (doc === null) return autoPositions;
    const overrides = doc.layout?.[layer];
    if (overrides === undefined) return autoPositions;

    const merged = new Map(autoPositions);
    for (const [id, override] of Object.entries(overrides)) {
      if (override.position !== undefined) {
        merged.set(id, override.position);
      }
    }
    return merged;
  }, [doc, layer, autoPositions]);
}

/**
 * Builds a stable string that changes ONLY when the topology relevant to
 * auto-layout changes. Used as the cache key for ELK invocations.
 *
 * Includes aggregateAt for group elements because changing aggregation
 * changes which elements are visible (children get hidden/shown), which
 * IS a topology change requiring a re-layout.
 */
function computeTopologyKey(doc: ProjectDocument | null, layer: LayerId): string {
  if (doc === null) return "empty";
  const elementSig = doc.elements
    .map((e) => {
      const aggrPart = e.type === "group" ? `:${e.aggregateAt.join(",")}` : "";
      return `${e.id}:${e.parent ?? ""}:${e.minLayer}${aggrPart}`;
    })
    .join("|");
  const connSig = doc.connections.map((c) => `${c.id}:${c.from}>${c.to}:${c.minLayer}`).join("|");
  return `${layer}\n${elementSig}\n${connSig}`;
}
