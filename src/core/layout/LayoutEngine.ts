// ============================================================================
// LayoutEngine — the contract for auto-layout computation
// ============================================================================
// Application code uses this interface. Implementations (currently
// ElkLayoutEngine) are the ONLY files allowed to import the underlying
// layout libraries. Swapping ELK for dagre or a custom layout means changing
// one file, not the whole codebase.
//
// Hierarchical layout: a LayoutNode may carry `children`, forming a tree. The
// engine lays the tree out recursively — containers are sized to fit their
// children, and child positions come back relative to their parent (which is
// exactly what React Flow's sub-flow model expects).
// ============================================================================

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  /** Nested children. When present, the engine sizes this node to fit them. */
  children?: readonly LayoutNode[];
  /** Inner padding for a container — leaves room for a header, etc. */
  padding?: { top: number; left: number; bottom: number; right: number };
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
}

export interface LayoutOptions {
  /** Direction of layered flow. "DOWN" places sources at top, targets at bottom. */
  direction?: "DOWN" | "RIGHT";
  /** Spacing between nodes in the same rank. */
  nodeNodeSpacing?: number;
  /** Spacing between successive ranks. */
  rankSpacing?: number;
}

/** A laid-out node. Position is relative to the parent (root nodes: absolute). */
export interface LayoutResultNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Parent node id, or null for a top-level node. */
  parentId: string | null;
}

/** A point in absolute layout coordinates. */
export interface LayoutPoint {
  x: number;
  y: number;
}

/**
 * The engine's computed route for one edge: the FULL orthogonal polyline
 * (start → bends → end) in ABSOLUTE coordinates (the same space as a node's
 * accumulated absolute position). The renderer draws this verbatim — ELK picks
 * the port each end attaches to, so reproducing the whole route avoids the
 * darting you'd get by re-pinning the ends to fixed handles.
 */
export interface LayoutResultEdge {
  id: string;
  points: readonly LayoutPoint[];
}

export interface LayoutResult {
  /** Every laid-out node, keyed by id. Flat map; nesting lives in `parentId`. */
  nodes: ReadonlyMap<string, LayoutResultNode>;
  /** Per-edge bend points, keyed by edge id. Empty when the engine routed an
   *  edge with no bends (a straight segment). */
  edges: ReadonlyMap<string, readonly LayoutPoint[]>;
}

export interface LayoutEngine {
  /** Compute positions for all nodes (recursively for a tree). Async because
   *  most implementations delegate to a worker. */
  layout(
    nodes: readonly LayoutNode[],
    edges: readonly LayoutEdge[],
    options?: LayoutOptions,
  ): Promise<LayoutResult>;
}
