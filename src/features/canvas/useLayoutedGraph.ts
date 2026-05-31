// ============================================================================
// useLayoutedGraph — final node placements for the canvas
// ============================================================================
// Two-stage pipeline:
//
//   1. Auto-layout (expensive, async, runs in a Web Worker).
//      Depends ONLY on the topology of the maximal element set at this layer
//      AND the current expand/collapse state. Memoized on a topology hash so
//      it does NOT re-run when the user just drags a node or edits a property.
//
//   2. Override merge (cheap, sync).
//      For each visible element, the final parent-relative position is:
//         doc.layout[layer][id].position   ?? autoLayout[id]
//      The manual override always wins.
//
// Placements carry BOTH parent-relative coordinates (+ parentId + size, for
// React Flow's sub-flow model) AND absolute coordinates (so the canvas can
// fall back to top-level placement when an intermediate container is hidden by
// MVP scrubbing). Manual overrides are stored parent-relative, exactly as
// React Flow reports a dragged node's position.
//
// Critical design choice: positions are computed for the MAXIMAL set across
// all MVPs (resolve at the latest MVP). MVP scrubbing reveals/hides elements
// but never reshuffles the diagram.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import { resolve } from "@/core/doc/resolve";
import { elkLayoutEngine } from "@/core/layout/ElkLayoutEngine";
import { useViewStore } from "@/core/state/viewStore";
import { buildLayoutTree } from "@/features/canvas/buildLayoutTree";

import type { GroupExpansion } from "@/core/doc/resolve";
import type { LayoutResultNode } from "@/core/layout/LayoutEngine";
import type { LayerId, ProjectDocument } from "@/core/schema/schema";

export interface Placement {
  /** Parent-relative position (what React Flow wants for a nested node). */
  x: number;
  y: number;
  /** Absolute position — used when the node is rendered at the top level. */
  absX: number;
  absY: number;
  width: number;
  height: number;
  /** Layout parent id (the maximal structure), or null for a root node. */
  parentId: string | null;
}

export type PlacementMap = ReadonlyMap<string, Placement>;

export function useLayoutedGraph(doc: ProjectDocument | null, layer: LayerId): PlacementMap {
  const groupExpansion = useViewStore((s) => s.groupExpansion);
  const [autoNodes, setAutoNodes] = useState<ReadonlyMap<string, LayoutResultNode>>(
    () => new Map(),
  );

  // Hash the topology so we re-run ELK only when the graph shape actually
  // changes (elements added/removed, connections added/removed, parent
  // relationships moved, aggregation config changed, or expand/collapse
  // toggled). Position overrides and property edits do NOT contribute.
  const topologyKey = useMemo(
    () => computeTopologyKey(doc, layer, groupExpansion),
    [doc, layer, groupExpansion],
  );
  const lastTopologyKey = useRef<string | null>(null);

  useEffect(() => {
    if (doc === null) {
      setAutoNodes(new Map());
      lastTopologyKey.current = null;
      return;
    }

    if (topologyKey === lastTopologyKey.current) return; // topology unchanged
    lastTopologyKey.current = topologyKey;

    const latestMvp = [...doc.mvps].sort((a, b) => b.order - a.order)[0];
    if (latestMvp === undefined) {
      setAutoNodes(new Map());
      return;
    }

    const maximal = resolve(doc, layer, latestMvp.id, groupExpansion);
    const tree = buildLayoutTree(maximal.elements, maximal.containment);
    const layoutEdges = maximal.edges.map((e) => ({ id: e.id, source: e.from, target: e.to }));

    let cancelled = false;

    void elkLayoutEngine
      .layout(tree, layoutEdges, { direction: "DOWN" })
      .then((result) => {
        if (cancelled) return;
        setAutoNodes(result.nodes);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Layout failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [doc, layer, topologyKey, groupExpansion]);

  // Override merge + absolute-coordinate resolution — runs every render. Cheap.
  return useMemo(() => mergePlacements(autoNodes, doc?.layout?.[layer]), [autoNodes, doc, layer]);
}

/**
 * Resolve every auto-laid-out node into a {@link Placement}: apply the manual
 * parent-relative override if present, then accumulate parent offsets into an
 * absolute position. Parents are processed before children.
 */
function mergePlacements(
  autoNodes: ReadonlyMap<string, LayoutResultNode>,
  overrides:
    | Readonly<Record<string, { position?: { x: number; y: number } | undefined }>>
    | undefined,
): PlacementMap {
  const placements = new Map<string, Placement>();

  const resolveNode = (id: string): Placement => {
    const existing = placements.get(id);
    if (existing !== undefined) return existing;

    const node = autoNodes.get(id);
    if (node === undefined) {
      const fallback: Placement = {
        x: 0,
        y: 0,
        absX: 0,
        absY: 0,
        width: 0,
        height: 0,
        parentId: null,
      };
      placements.set(id, fallback);
      return fallback;
    }

    const override = overrides?.[id]?.position;
    const x = override?.x ?? node.x;
    const y = override?.y ?? node.y;
    const parent = node.parentId !== null ? resolveNode(node.parentId) : null;
    const placement: Placement = {
      x,
      y,
      absX: (parent?.absX ?? 0) + x,
      absY: (parent?.absY ?? 0) + y,
      width: node.width,
      height: node.height,
      parentId: node.parentId,
    };
    placements.set(id, placement);
    return placement;
  };

  for (const id of autoNodes.keys()) resolveNode(id);
  return placements;
}

/**
 * Builds a stable string that changes ONLY when the topology relevant to
 * auto-layout changes. Used as the cache key for ELK invocations.
 *
 * Includes aggregateAt for group elements and the expand/collapse overrides,
 * because both change which elements are visible and how they nest — that IS a
 * topology change requiring a re-layout.
 */
function computeTopologyKey(
  doc: ProjectDocument | null,
  layer: LayerId,
  expansion: GroupExpansion,
): string {
  if (doc === null) return "empty";
  const elementSig = doc.elements
    .map((e) => {
      const aggrPart = e.type === "group" ? `:${e.aggregateAt.join(",")}` : "";
      return `${e.id}:${e.parent ?? ""}:${e.minLayer}${aggrPart}`;
    })
    .join("|");
  const connSig = doc.connections.map((c) => `${c.id}:${c.from}>${c.to}:${c.minLayer}`).join("|");
  const expansionSig = Object.keys(expansion)
    .sort()
    .map((id) => `${id}=${expansion[id] === true ? "1" : "0"}`)
    .join(",");
  return `${layer}\n${elementSig}\n${connSig}\n${expansionSig}`;
}
