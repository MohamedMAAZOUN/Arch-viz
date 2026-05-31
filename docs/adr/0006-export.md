# ADR-0006 — Export (JSON / PNG / SVG)

## Status

Accepted · May 31, 2026

## Context

The inspector's global "Export" section was a placeholder (issue #4). We want
to download the project as data (JSON) and as an image (PNG/SVG) of the graph.
JSON is trivial; images need a library and access to React Flow's node bounds
and the live DOM — both behind the Canvas wrapper, which is the only file
allowed to import `@xyflow/react`.

## Decision

- **JSON** — `core/export/exportJson.serializeProject(doc)` pretty-prints the
  current document. It round-trips: feeding the output back through the parser
  yields an equivalent document (covered by a test).
- **PNG / SVG** via `html-to-image`, wrapped and **dynamically imported** so it
  only loads on an actual export (kept out of the main bundle).
- **Bridge — `core/export/canvasExporter.ts`.** Rather than leak React Flow
  into the inspector, the Canvas registers an imperative exporter (a module
  singleton) on mount; the export UI looks it up at click time. The exporter
  uses `getNodesBounds` + the `.react-flow__viewport` DOM node to capture the
  graph framed 1:1 with padding — nodes + edges only, no UI chrome — with the
  themed background baked in. This captures the current layer + MVP ("export
  what you see").
- **UI — `inspector/sections/ExportSection`** replaces the placeholder: JSON /
  PNG / SVG buttons, an async busy state, and inline error reporting (image
  export can fail on an empty view or browser quirk; it never throws past the
  handler). `core/export/downloadFile` is the one place we synthesize an
  `<a download>` click.
- **PDF deferred** (the issue marks it lowest priority; chosen with the user).

## Consequences

What gets easier:
- One-click data and image export; JSON is a guaranteed-valid project file.
- The React Flow boundary stays intact — the inspector never imports xyflow;
  it calls a registered function.

What we accept:
- The image capture frames the whole visible graph (fit + padding) rather than
  the literal pixel viewport — more useful for sharing, and avoids cropping.
- `html-to-image` inlines computed styles; very exotic CSS could render
  imperfectly. Acceptable for a diagram of themed cards + edges.

## Alternatives considered

- **JSON only for now.** Offered; the user chose to add the image library.
- **Capturing the whole `.react-flow` element** (incl. minimap/controls).
  Rejected — we want a clean diagram, so we capture just the viewport layer.
- **A second xyflow-importing module for export.** Rejected to keep the wrapper
  boundary at one file; the Canvas registers a callback instead.
