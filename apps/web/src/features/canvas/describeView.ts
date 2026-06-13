// ============================================================================
// describeView — screen-reader text for the current canvas view
// ============================================================================
// Pure helper, kept out of Canvas.tsx so it can be unit-tested without pulling
// in React Flow. Feeds the canvas's aria-live landmark (a11y v1 — issue #28).
// ============================================================================

import type { LayerId, ProjectDocument } from "@arch-vis/schema";

/**
 * Compose the announcement for the current view: layer, MVP, and selection.
 * E.g. "Architecture layer. MVP Public beta. Selected Billing service."
 */
export function describeView(
  doc: ProjectDocument | null,
  layer: LayerId,
  mvp: string | null,
  selectedId: string | null,
  selectionCount: number,
): string {
  if (doc === null) return "No project loaded.";
  const layerLabel = doc.layers.find((l) => l.id === layer)?.label ?? layer;
  const mvpName = mvp !== null ? doc.mvps.find((m) => m.id === mvp)?.name : undefined;
  const mvpPart = mvpName !== undefined ? ` MVP ${mvpName}.` : "";

  let selectionPart = " Nothing selected.";
  if (selectionCount > 1) {
    selectionPart = ` ${String(selectionCount)} elements selected.`;
  } else if (selectedId !== null) {
    const name = doc.elements.find((e) => e.id === selectedId)?.name;
    if (name !== undefined) selectionPart = ` Selected ${name}.`;
  }

  return `${layerLabel} layer.${mvpPart}${selectionPart}`;
}
