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

type LayoutResponse =
  | { id: number; ok: true; nodes: ResultNode[] }
  | { id: number; ok: false; error: string };

// Minimal shape of an ELK graph node we BUILD as input — recursive. Edges are
// declared with just endpoints; ELK uses them to place nodes (we draw the lines
// ourselves with React Flow, so we never read the routes back).
interface ElkInputNode {
  id: string;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkInputNode[];
  edges?: { id: string; sources: string[]; targets: string[] }[];
}

// Minimal shape of the ELK RESULT we read back: node geometry only.
interface ElkResultNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkResultNode[];
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
        "elk.padding": "[top=32, left=32, bottom=32, right=32]",
        // Network-simplex placement straightens the hierarchy and tends to keep
        // each parent centered over its children — cheap and tidy. (We draw the
        // edges ourselves, so ELK's own edge routing is irrelevant here.)
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
    collect(result.children ?? [], null, out);

    const response: LayoutResponse = { id, ok: true, nodes: out };
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

/** Flatten ELK's result tree, recording each node's parent and relative pos. */
function collect(
  children: readonly ElkResultNode[],
  parentId: string | null,
  out: ResultNode[],
): void {
  for (const child of children) {
    out.push({
      id: child.id,
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? 0,
      height: child.height ?? 0,
      parentId,
    });
    if (child.children !== undefined && child.children.length > 0) {
      collect(child.children, child.id, out);
    }
  }
}
