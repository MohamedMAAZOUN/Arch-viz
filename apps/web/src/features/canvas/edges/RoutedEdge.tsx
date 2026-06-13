// ============================================================================
// RoutedEdge — calm, hover-labelled smoothstep edge
// ============================================================================
// Renders React Flow's smoothstep path, which always connects handle-to-handle
// (no gaps, no orphaned fragments) regardless of containers, collapse state, or
// MVP. ELK still computes node PLACEMENT — this just draws the lines between
// the placed nodes.
//
// It owns two readability behaviours:
//   - Labels appear only on hover/selection by default (issue #23); set
//     `labelMode: "always"` to pin them.
//   - The Canvas pre-bakes idle/emphasis/dim weight into `style`; hovering or
//     selecting an edge brightens and thickens it on top of that.
//
// Lives in features/canvas/edges/, ESLint-exempt from the no-@xyflow rule.
// ============================================================================

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react";
import { useState } from "react";

import type { EdgeLabelMode } from "@/core/state/canvasPrefsStore";
import type { Edge, EdgeProps } from "@xyflow/react";

import "@/features/canvas/edges/RoutedEdge.css";

export interface RoutedEdgeData extends Record<string, unknown> {
  /** Protocol or ×count text shown as the edge label. */
  labelText?: string;
  /** Whether labels show always or only on hover/selection. */
  labelMode: EdgeLabelMode;
}

export type RoutedEdgeType = Edge<RoutedEdgeData, "routed">;

const CORNER_RADIUS = 12;

export function RoutedEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  style,
  selected,
  data,
}: EdgeProps<RoutedEdgeType>) {
  const [hovered, setHovered] = useState(false);

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: CORNER_RADIUS,
  });

  const active = hovered || selected === true;
  const showLabel =
    data?.labelText !== undefined &&
    data.labelText !== "" &&
    (data.labelMode === "always" || active);

  // Emphasis/dim is precomputed into the style by the Canvas; hover and
  // selection brighten on top of it without recomputing the whole edge set.
  const resolvedStyle: React.CSSProperties = {
    ...style,
    ...(active ? { opacity: 1, strokeWidth: 2.5 } : {}),
  };

  return (
    <>
      <BaseEdge
        path={path}
        {...(markerEnd !== undefined ? { markerEnd } : {})}
        style={resolvedStyle}
      />
      {/* Invisible fat path widens the hover/click target without thickening
          the visible line. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="routed-edge-interaction"
        onMouseEnter={() => {
          setHovered(true);
        }}
        onMouseLeave={() => {
          setHovered(false);
        }}
      />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="routed-edge-label"
            data-active={active ? true : undefined}
            style={{
              transform: `translate(-50%, -50%) translate(${String(labelX)}px, ${String(labelY)}px)`,
            }}
          >
            {data.labelText}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
