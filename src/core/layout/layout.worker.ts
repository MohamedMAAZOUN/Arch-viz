// ============================================================================
// layout.worker.ts — ELK layout in a Web Worker
// ============================================================================
// Off the main thread so the UI stays responsive during layout. ELK is heavy;
// isolating it here keeps the main bundle lean and the canvas chunk free of
// the layout cost for users who never trigger one.
//
// Wire protocol:
//   in:  { id, nodes, edges, options }   // nodes form a tree (children[])
//   out: { id, ok: true,  nodes: ResultNode[] }
//        | { id, ok: false, error: string }
//
// Each ResultNode carries position RELATIVE TO ITS PARENT plus the parent id,
// which is exactly what React Flow's sub-flow (parentId + extent:"parent")
// model needs. Container sizes are computed by ELK to fit their children.
//
// id roundtrips so the main thread can correlate responses with requests
// and discard stale ones.
//
// IMPORTANT — do NOT switch to `elkjs/lib/elk.bundled.js`.
// The bundled build internally does `require('./elk-worker.min.js')` to spawn
// a sub-worker. Rollup's CJS plugin unwraps that require at build time, which
// breaks ELK's runtime check for "am I in a worker context" — the result is
// `_Worker is not a constructor` thrown from inside the worker.
//
// Instead we use `elk-api.js` (the lighter client API) and tell it where to
// find `elk-worker.min.js` via Vite's `?url` import, which emits the worker
// script as a standalone asset. ELK then uses the global `Worker` constructor
// (present in our worker scope) to spawn the sub-worker cleanly.
// ============================================================================

import ELK from "elkjs/lib/elk-api.js";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";

import type { LayoutEdge, LayoutNode, LayoutOptions } from "@/core/layout/LayoutEngine";

interface LayoutRequest {
  id: number;
  nodes: readonly LayoutNode[];
  edges: readonly LayoutEdge[];
  options: Required<LayoutOptions>;
}

interface ResultNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
}

interface ResultEdge {
  id: string;
  points: { x: number; y: number }[];
}

type LayoutResponse =
  | { id: number; ok: true; nodes: ResultNode[]; edges: ResultEdge[] }
  | { id: number; ok: false; error: string };

interface ElkPoint {
  x: number;
  y: number;
}

// Minimal shape of an ELK graph node we BUILD as input — recursive. Edges are
// declared with just endpoints; ELK fills in routing sections on the result.
interface ElkInputNode {
  id: string;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkInputNode[];
  edges?: { id: string; sources: string[]; targets: string[] }[];
}

// Minimal shape of the ELK RESULT we read back: node geometry plus each edge's
// routing sections (start/bend/end points).
interface ElkResultEdgeSection {
  startPoint?: ElkPoint;
  endPoint?: ElkPoint;
  bendPoints?: ElkPoint[];
}

interface ElkResultEdge {
  id: string;
  sections?: ElkResultEdgeSection[];
}

interface ElkResultNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkResultNode[];
  edges?: ElkResultEdge[];
}

// Use elk-api with elk-worker.min.js loaded as a real sub-worker script.
// elk-api uses the global Worker constructor with the provided workerUrl,
// which works correctly inside our outer worker context.
const elk = new ELK({ workerUrl: elkWorkerUrl });

// The listener is `void`-returning; we wrap the async handler so the promise
// is consumed correctly. (no-misused-promises forbids passing an async fn
// directly to addEventListener.)
self.addEventListener("message", (event: MessageEvent<LayoutRequest>) => {
  void handleMessage(event);
});

async function handleMessage(event: MessageEvent<LayoutRequest>): Promise<void> {
  const { id, nodes, edges, options } = event.data;

  try {
    const graph: ElkInputNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": options.direction,
        // INCLUDE_CHILDREN lets edges span hierarchy boundaries and lets the
        // layered algorithm recurse into compound nodes in one pass.
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
        "elk.spacing.nodeNode": String(options.nodeNodeSpacing),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(options.rankSpacing),
        // Keep edges (and their labels) from crowding the nodes they pass.
        "elk.spacing.edgeNode": "40",
        "elk.layered.spacing.edgeNodeBetweenLayers": "40",
        "elk.spacing.edgeEdge": "18",
        "elk.layered.spacing.edgeEdgeBetweenLayers": "18",
        "elk.padding": "[top=32, left=32, bottom=32, right=32]",
        // ORTHOGONAL routing yields clean right-angled lines that follow the
        // channels between layers instead of cutting diagonally through
        // unrelated containers — the renderer consumes the computed bend
        // points (see ResultEdge) so what's drawn matches what ELK planned.
        "elk.edgeRouting": "ORTHOGONAL",
        // Merge edges that share an endpoint into a common trunk, which cuts
        // the parallel-line spaghetti when many nodes fan into one.
        "elk.layered.mergeEdges": "true",
        // Network-simplex node placement straightens edges and tightens the
        // diagram without the heavier thoroughness/crossing knobs that would
        // worsen the layout-time budget (see issue #25).
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      },
      children: nodes.map(toElkNode),
      // All edges are declared at the root; INCLUDE_CHILDREN routes the ones
      // that cross into nested containers.
      edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    };

    const result = (await elk.layout(
      graph as unknown as Parameters<typeof elk.layout>[0],
    )) as unknown as ElkResultNode;

    const out: ResultNode[] = [];
    const outEdges: ResultEdge[] = [];
    // Root-level edges are positioned relative to the root origin (0,0).
    collectEdges(result.edges, 0, 0, outEdges);
    collect(result.children ?? [], null, 0, 0, out, outEdges);

    const response: LayoutResponse = { id, ok: true, nodes: out, edges: outEdges };
    self.postMessage(response);
  } catch (err) {
    const response: LayoutResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
}

/** Translate our LayoutNode tree into ELK's graph node shape. */
function toElkNode(node: LayoutNode): ElkInputNode {
  const hasChildren = node.children !== undefined && node.children.length > 0;
  const elkNode: ElkInputNode = { id: node.id };

  if (hasChildren && node.children !== undefined) {
    const p = node.padding ?? { top: 24, left: 24, bottom: 24, right: 24 };
    elkNode.layoutOptions = {
      "elk.padding": `[top=${String(p.top)}, left=${String(p.left)}, bottom=${String(p.bottom)}, right=${String(p.right)}]`,
    };
    elkNode.children = node.children.map(toElkNode);
  } else {
    // Leaf: fixed size drives the layout.
    elkNode.width = node.width;
    elkNode.height = node.height;
  }

  return elkNode;
}

/**
 * Flatten ELK's result tree, recording each node's parent and relative pos.
 * `offX`/`offY` are the parent container's ABSOLUTE origin, accumulated as we
 * recurse so edges nested inside a container can be lifted into absolute space.
 */
function collect(
  children: readonly ElkResultNode[],
  parentId: string | null,
  offX: number,
  offY: number,
  out: ResultNode[],
  outEdges: ResultEdge[],
): void {
  for (const child of children) {
    const x = child.x ?? 0;
    const y = child.y ?? 0;
    out.push({
      id: child.id,
      x,
      y,
      width: child.width ?? 0,
      height: child.height ?? 0,
      parentId,
    });

    // Edges assigned to this compound node are routed in ITS coordinate space;
    // its absolute origin is the accumulated offset plus its own position.
    const childAbsX = offX + x;
    const childAbsY = offY + y;
    collectEdges(child.edges, childAbsX, childAbsY, outEdges);

    if (child.children !== undefined && child.children.length > 0) {
      collect(child.children, child.id, childAbsX, childAbsY, out, outEdges);
    }
  }
}

/**
 * Lift each edge's interior bend points into absolute coordinates by the
 * container offset. Endpoints (start/end) are dropped — the renderer pins the
 * path to the live source/target handles, so only the bends matter.
 */
function collectEdges(
  edges: readonly ElkResultEdge[] | undefined,
  offX: number,
  offY: number,
  out: ResultEdge[],
): void {
  if (edges === undefined) return;
  for (const edge of edges) {
    const section = edge.sections?.[0];
    const bends = section?.bendPoints ?? [];
    out.push({
      id: edge.id,
      points: bends.map((p) => ({ x: p.x + offX, y: p.y + offY })),
    });
  }
}
