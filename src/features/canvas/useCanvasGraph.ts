// ============================================================================
// useCanvasGraph — produces canvas-ready nodes and edges
// ============================================================================
// Pipeline:
//   document (DocStore) → resolve(layer, mvp) → ELK layout → positioned nodes
//
// The layout is async and structurally memoized: it only re-runs when the
// SHAPE of the graph changes (which elements/connections exist), not on
// selection or other view-only changes.
// ============================================================================

import { useEffect, useMemo, useState } from "react";

import { resolve } from "@/core/doc/resolve";
import { useDoc } from "@/core/doc/useDoc";
import { elkLayoutEngine } from "@/core/layout/ElkLayoutEngine";
import { useViewStore } from "@/core/state/viewStore";
import { NODE_DIMENSIONS } from "@/features/canvas/types";

import type { LayoutEdge, LayoutNode } from "@/core/layout/LayoutEngine";
import type { CanvasEdge, CanvasNode } from "@/features/canvas/types";

interface GraphState {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  isLayouting: boolean;
}

const EMPTY: GraphState = { nodes: [], edges: [], isLayouting: false };

export function useCanvasGraph(): GraphState {
  const doc = useDoc();
  const currentLayer = useViewStore((s) => s.currentLayer);
  const currentMvp = useViewStore((s) => s.currentMvp);

  // Step 1: pure resolve — what is visible at (layer, mvp)
  const resolved = useMemo(() => {
    if (doc === null || currentMvp === null) return null;
    return resolve(doc, currentLayer, currentMvp);
  }, [doc, currentLayer, currentMvp]);

  // Step 2: structural signature — only re-layout when shape changes
  const structureSig = useMemo(() => {
    if (resolved === null) return "";
    const nodeIds = resolved.elements.map((e) => `${e.id}:${e.type}`).join("|");
    const edgeIds = resolved.connections.map((c) => `${c.from}->${c.to}`).join("|");
    return `${nodeIds}#${edgeIds}`;
  }, [resolved]);

  // Step 3: run ELK layout
  const [positions, setPositions] = useState<ReadonlyMap<string, { x: number; y: number }>>(
    new Map(),
  );
  const [isLayouting, setIsLayouting] = useState(false);

  useEffect(() => {
    if (resolved === null || resolved.elements.length === 0) {
      setPositions(new Map());
      return;
    }

    const layoutNodes: LayoutNode[] = resolved.elements.map((el) => {
      const dim = el.type === "group" ? NODE_DIMENSIONS.group : NODE_DIMENSIONS.default;
      return { id: el.id, width: dim.width, height: dim.height };
    });

    const layoutEdges: LayoutEdge[] = resolved.connections.map((c) => ({
      id: c.id,
      source: c.from,
      target: c.to,
    }));

    let cancelled = false;
    setIsLayouting(true);

    elkLayoutEngine
      .layout(layoutNodes, layoutEdges, { direction: "DOWN" })
      .then((result) => {
        if (cancelled) return;
        setPositions(result.positions);
        setIsLayouting(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("ELK layout failed:", err);
        setIsLayouting(false);
      });

    return () => {
      cancelled = true;
    };
    // structureSig captures the relevant inputs; resolved is referenced for value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureSig]);

  // Step 4: combine positions + resolved into CanvasNode/CanvasEdge
  return useMemo<GraphState>(() => {
    if (resolved === null) return EMPTY;

    const nodes: CanvasNode[] = resolved.elements.map((el) => {
      const dim = el.type === "group" ? NODE_DIMENSIONS.group : NODE_DIMENSIONS.default;
      const pos = positions.get(el.id) ?? { x: 0, y: 0 };
      return {
        element: el,
        x: pos.x,
        y: pos.y,
        width: dim.width,
        height: dim.height,
      };
    });

    const edges: CanvasEdge[] = resolved.connections.map((connection) => ({ connection }));

    return { nodes, edges, isLayouting };
  }, [resolved, positions, isLayouting]);
}
