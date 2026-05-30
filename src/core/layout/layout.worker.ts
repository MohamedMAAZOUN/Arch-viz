// ============================================================================
// layout.worker.ts — ELK layout in a Web Worker
// ============================================================================
// Off the main thread so the UI stays responsive during layout. ELK is heavy;
// isolating it here keeps the main bundle lean and the canvas chunk free of
// the layout cost for users who never trigger one.
//
// Wire protocol:
//   in:  { id, nodes, edges, options }
//   out: { id, ok: true,  positions: [string, {x,y}][] }
//        | { id, ok: false, error: string }
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

type LayoutResponse =
  | { id: number; ok: true; positions: [string, { x: number; y: number }][] }
  | { id: number; ok: false; error: string };

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
    const graph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": options.direction,
        "elk.spacing.nodeNode": String(options.nodeNodeSpacing),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(options.rankSpacing),
        "elk.padding": "[top=24, left=24, bottom=24, right=24]",
      },
      children: nodes.map((n) => ({
        id: n.id,
        width: n.width,
        height: n.height,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
    };

    const result = await elk.layout(graph);
    const positions: [string, { x: number; y: number }][] = [];
    for (const child of result.children ?? []) {
      if (child.x !== undefined && child.y !== undefined) {
        positions.push([child.id, { x: child.x, y: child.y }]);
      }
    }

    const response: LayoutResponse = { id, ok: true, positions };
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
