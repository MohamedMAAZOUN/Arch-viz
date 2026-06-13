// ============================================================================
// ExportSection — download the project as JSON, PNG, or SVG
// ============================================================================
// JSON serializes the current document (round-trips through the parser).
// PNG / SVG ask the Canvas's registered exporter to capture the visible graph
// at the current layer + MVP. Image export is async and can fail (empty view,
// browser quirks); failures surface inline and never throw past here.
// ============================================================================

import { useState } from "react";

import { getCanvasExporter } from "@/core/export/canvasExporter";
import { downloadDataUrl, downloadText } from "@/core/export/downloadFile";
import { exportBaseName, serializeProject } from "@/core/export/exportJson";
import { useViewStore } from "@/core/state/viewStore";

import type { ImageFormat } from "@/core/export/canvasExporter";
import type { ProjectDocument } from "@arch-vis/schema";

export function ExportSection({ doc }: { doc: ProjectDocument }) {
  const currentLayer = useViewStore((s) => s.currentLayer);
  const currentMvp = useViewStore((s) => s.currentMvp);
  const [busy, setBusy] = useState<ImageFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onJson = () => {
    setError(null);
    downloadText(serializeProject(doc), `${exportBaseName(doc)}.json`, "application/json");
  };

  const onImage = async (format: ImageFormat) => {
    setError(null);
    const exporter = getCanvasExporter();
    if (exporter === null) {
      setError("Canvas isn't ready yet — try again in a moment.");
      return;
    }
    setBusy(format);
    try {
      const dataUrl = await exporter(format);
      const mvpPart = currentMvp !== null ? `-${currentMvp}` : "";
      downloadDataUrl(dataUrl, `${exportBaseName(doc)}-${currentLayer}${mvpPart}.${format}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="inspector-export">
      <div className="inspector-export-row">
        <button type="button" className="inspector-export-btn" onClick={onJson}>
          JSON
        </button>
        <button
          type="button"
          className="inspector-export-btn"
          onClick={() => void onImage("png")}
          disabled={busy !== null}
        >
          {busy === "png" ? "…" : "PNG"}
        </button>
        <button
          type="button"
          className="inspector-export-btn"
          onClick={() => void onImage("svg")}
          disabled={busy !== null}
        >
          {busy === "svg" ? "…" : "SVG"}
        </button>
      </div>
      <p className="inspector-export-hint">
        Images capture the visible graph at the current layer &amp; MVP.
      </p>
      {error !== null ? <p className="inspector-export-error">{error}</p> : null}
    </div>
  );
}
