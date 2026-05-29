// ============================================================================
// LayoutEngine — the contract for auto-layout computation
// ============================================================================
// Application code uses this interface. Implementations (currently
// ElkLayoutEngine) are the ONLY files allowed to import the underlying
// layout libraries. Swapping ELK for dagre or a custom layout means changing
// one file, not the whole codebase.
// ============================================================================

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  /** Optional manual override; if set, layout should pin this node. */
  pinnedPosition?: { x: number; y: number };
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

export interface LayoutResult {
  positions: ReadonlyMap<string, { x: number; y: number }>;
}

export interface LayoutEngine {
  /** Compute positions for all nodes. Async because most implementations
   *  delegate to a worker. */
  layout(
    nodes: readonly LayoutNode[],
    edges: readonly LayoutEdge[],
    options?: LayoutOptions,
  ): Promise<LayoutResult>;
}
