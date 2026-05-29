// ============================================================================
// ElkLayoutEngine — main-thread wrapper around the layout worker
// ============================================================================
// After the v2 refactor: ELK runs entirely in a Web Worker. This file just
// shuttles requests and responses, applies defaults, and dedupes stale
// responses by correlating on a request id.
//
// The actual elkjs import lives in layout.worker.ts so the main bundle stays
// lean. The worker file is exempted from the no-elkjs-imports rule.
// ============================================================================

import type {
  LayoutEdge,
  LayoutEngine,
  LayoutNode,
  LayoutOptions,
  LayoutResult,
} from "@/core/layout/LayoutEngine";

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  direction: "DOWN",
  nodeNodeSpacing: 60,
  rankSpacing: 80,
};

type WorkerResponse =
  | { id: number; ok: true; positions: [string, { x: number; y: number }][] }
  | { id: number; ok: false; error: string };

export class ElkLayoutEngine implements LayoutEngine {
  private readonly worker: Worker;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: LayoutResult) => void; reject: (reason: Error) => void }
  >();

  constructor() {
    // Vite resolves this special URL at build time and emits the worker as
    // its own chunk. ELK ends up in that chunk, not the main bundle.
    this.worker = new Worker(new URL("./layout.worker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const callbacks = this.pending.get(response.id);
      if (callbacks === undefined) return; // stale; ignore
      this.pending.delete(response.id);

      if (response.ok) {
        callbacks.resolve({ positions: new Map(response.positions) });
      } else {
        callbacks.reject(new Error(response.error));
      }
    });

    this.worker.addEventListener("error", (event) => {
      // Reject every pending request; we don't know which one failed.
      const message = event.message || "layout worker error";
      for (const { reject } of this.pending.values()) {
        reject(new Error(message));
      }
      this.pending.clear();
    });
  }

  async layout(
    nodes: readonly LayoutNode[],
    edges: readonly LayoutEdge[],
    options: LayoutOptions = {},
  ): Promise<LayoutResult> {
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    const opts: Required<LayoutOptions> = { ...DEFAULT_OPTIONS, ...options };

    return new Promise<LayoutResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, nodes, edges, options: opts });
    });
  }
}

export const elkLayoutEngine: LayoutEngine = new ElkLayoutEngine();
