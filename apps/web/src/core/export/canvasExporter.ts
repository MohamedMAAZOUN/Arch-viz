// ============================================================================
// canvasExporter — registry bridging the Canvas to the export UI
// ============================================================================
// Rasterizing/vectorizing the graph needs React Flow internals (node bounds)
// and the live DOM — both of which live behind the Canvas wrapper. Rather than
// leak React Flow into the inspector, the Canvas registers an imperative
// exporter here on mount, and the export UI looks it up at click time.
//
// A plain module singleton (not a store): availability is read on demand in an
// event handler, so no component needs to re-render when it changes.
// ============================================================================

export type ImageFormat = "png" | "svg";

/** Produce a data URL for the current canvas in the requested format. */
export type CanvasImageExporter = (format: ImageFormat) => Promise<string>;

let current: CanvasImageExporter | null = null;

export function registerCanvasExporter(exporter: CanvasImageExporter | null): void {
  current = exporter;
}

export function getCanvasExporter(): CanvasImageExporter | null {
  return current;
}
