// ============================================================================
// Canvas types — the contract between useCanvasGraph and the Canvas wrapper
// ============================================================================
// These are OUR types. React Flow's Node/Edge live only inside Canvas.tsx.
// ============================================================================

import type { Connection, Element } from "@/core/schema/schema";

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

/** Default node dimensions used both for layout input and rendering. */
export const NODE_DIMENSIONS = {
  default: { width: 220, height: 84 },
  group: { width: 260, height: 96 },
} as const;
