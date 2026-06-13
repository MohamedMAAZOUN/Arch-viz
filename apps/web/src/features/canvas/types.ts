// ============================================================================
// Canvas types — the contract between useLayoutedGraph and the Canvas wrapper
// ============================================================================
// These are OUR types. React Flow's Node/Edge live only inside Canvas.tsx.
// ============================================================================

import type { Connection, Element } from "@arch-vis/schema";

export interface CanvasNode {
  /** The full resolved element — node component picks what to render. */
  element: Element;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasEdge {
  connection: Connection;
}

/**
 * Default node dimensions used both for layout input and rendering. Height is
 * the WORST case a card reaches (header row + 2-line clamped description +
 * a row of tags + padding) so ELK never lets a tall card overlap the row
 * beneath it. Shorter cards simply leave a little breathing room — which reads
 * as a clean, consistent grid.
 */
export const NODE_DIMENSIONS = {
  default: { width: 220, height: 116 },
  group: { width: 260, height: 120 },
} as const;

/**
 * Compact-density footprints. A compact card is a single header row (type glyph
 * + name + badges) with description and tags hidden, so it reserves far less
 * room — letting ELK pack a dense diagram tighter. Mirrors the compact card CSS
 * in ElementNode.css. Used when the user picks "compact" density.
 */
export const COMPACT_NODE_DIMENSIONS = {
  default: { width: 184, height: 48 },
  group: { width: 208, height: 52 },
} as const;

/** Structural footprint type — satisfied by both comfortable and compact. */
export interface NodeDimensions {
  default: { width: number; height: number };
  group: { width: number; height: number };
}

/**
 * Inner padding ELK reserves inside an expanded container. `top` clears the
 * container header (name + chevron) AND leaves a comfortable gap below it; the
 * rest frames the nested children. Kept in sync with `--group-header-height` in
 * GroupNode.css (header 44 + ~36 gap so the first child row isn't crowded).
 */
export const CONTAINER_PADDING = { top: 80, left: 28, bottom: 28, right: 28 } as const;

/** Tighter container padding for compact density (shorter header, less frame). */
export const COMPACT_CONTAINER_PADDING = { top: 52, left: 18, bottom: 18, right: 18 } as const;
