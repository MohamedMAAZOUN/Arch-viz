// ============================================================================
// RoutedEdge — edge that follows ELK's computed orthogonal route
// ============================================================================
// React Flow's built-in edges re-route themselves (smoothstep just bends
// around the bounding boxes of its own endpoints) and happily cut straight
// through unrelated containers. ELK already computed a clean, crossing-minimized
// orthogonal route for every edge during layout; this component DRAWS that
// route so what you see matches what the layout engine planned.
//
//   - When `data.points` is present (ELK's absolute bend points), the path is
//     pinned to the live source/target handles and threaded through those
//     bends with rounded corners.
//   - Otherwise (a layer with manual overrides, where stored bends are stale,
//     or an edge ELK didn't route) it falls back to a smoothstep path.
//
// It also owns two readability behaviours:
//   - Labels appear only on hover/selection by default (issue #23); set
//     `labelMode: "always"` to pin them.
//   - Idle edges are de-emphasized; an edge touching the focused node (or under
//     the pointer) brightens and thickens.
//
// Lives in features/canvas/edges/, which is ESLint-exempt from the
// "no @xyflow/react outside Canvas.tsx" rule (same carve-out as nodes/).
// ============================================================================

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react";
import { useState } from "react";

import type { LayoutPoint } from "@/core/layout/LayoutEngine";
import type { EdgeLabelMode } from "@/core/state/canvasPrefsStore";
import type { Edge, EdgeProps } from "@xyflow/react";

import "@/features/canvas/edges/RoutedEdge.css";

export interface RoutedEdgeData extends Record<string, unknown> {
  /** ELK's full route (start → bends → end, absolute). A non-empty list is
   *  drawn verbatim; absent or empty → fall back to smoothstep. */
  points?: readonly LayoutPoint[];
  /** Protocol or ×count text shown as the edge label. */
  labelText?: string;
  /** Whether labels show always or only on hover/selection. */
  labelMode: EdgeLabelMode;
  /** Touches the focused node (or no focus is active) → drawn at full weight. */
  emphasized: boolean;
  /** Focus is active and this edge is outside it → faded right back. */
  dimmed: boolean;
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

  // Build the visible path + a point to anchor the label.
  let path: string;
  let labelX: number;
  let labelY: number;

  const route = data?.points;
  if (route !== undefined && route.length >= 2) {
    // Draw ELK's full computed route (start → bends → end), but pin each end
    // to the real handle when ELK left a little clearance there. ELK gives a
    // forward edge a small gap at the node border; snapping it to the handle
    // closes the "line doesn't reach the node" gap. A back-edge leaves the
    // OPPOSITE side (its endpoint is far from the handle, on the other face),
    // so we leave it alone — snapping it would dart back through the node.
    const pts = snapEndpointsToHandles(route, sourceX, sourceY, targetX, targetY);
    path = roundedPath(pts, CORNER_RADIUS);
    const mid = pts[Math.floor(pts.length / 2)] ?? pts[0];
    labelX = mid?.x ?? sourceX;
    labelY = mid?.y ?? sourceY;
  } else {
    const [d, lx, ly] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: CORNER_RADIUS,
    });
    path = d;
    labelX = lx;
    labelY = ly;
  }

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

// ---------------------------------------------------------------------------
// Path geometry
// ---------------------------------------------------------------------------

// How close (in y) ELK's endpoint must be to a handle to count as "same side".
// A forward edge's port sits within a node-border clearance of the handle
// (~12-20px); a back-edge's port is a full node-height away on the far side, so
// this margin separates the two cleanly even for compact (48px-tall) cards.
const SAME_SIDE_MARGIN = 26;

/**
 * Pin the route's first/last point to the source/target handle when ELK placed
 * its endpoint on the SAME face as the handle (source handle = node bottom,
 * target handle = node top, in our DOWN layout). This closes the small gap ELK
 * leaves at a forward edge's border without touching back-edges, whose ports
 * are correctly on the opposite face and must keep their own route.
 */
function snapEndpointsToHandles(
  route: readonly LayoutPoint[],
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): LayoutPoint[] {
  const pts = route.map((p) => ({ x: p.x, y: p.y }));
  const start = pts[0];
  const end = pts[pts.length - 1];
  if (start !== undefined && Math.abs(start.y - sourceY) <= SAME_SIDE_MARGIN) {
    pts[0] = { x: sourceX, y: sourceY };
  }
  if (end !== undefined && Math.abs(end.y - targetY) <= SAME_SIDE_MARGIN) {
    pts[pts.length - 1] = { x: targetX, y: targetY };
  }
  return pts;
}

/**
 * An SVG path through `points` with rounded corners at each interior vertex.
 * The corner radius is clamped to half the shorter adjacent segment so tight
 * zig-zags don't overshoot. Two points → a straight line.
 */
function roundedPath(points: readonly LayoutPoint[], radius: number): string {
  if (points.length < 2) return "";
  const first = points[0];
  if (first === undefined) return "";
  if (points.length === 2) {
    const end = points[1];
    if (end === undefined) return "";
    return `M${String(first.x)},${String(first.y)} L${String(end.x)},${String(end.y)}`;
  }

  let d = `M${String(first.x)},${String(first.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    if (p0 === undefined || p1 === undefined || p2 === undefined) continue;

    const d01 = dist(p0, p1);
    const d12 = dist(p1, p2);
    const r1 = Math.min(radius, d01 / 2);
    const r2 = Math.min(radius, d12 / 2);

    const a = d01 === 0 ? p1 : lerp(p1, p0, r1 / d01);
    const b = d12 === 0 ? p1 : lerp(p1, p2, r2 / d12);

    d += ` L${String(a.x)},${String(a.y)} Q${String(p1.x)},${String(p1.y)} ${String(b.x)},${String(b.y)}`;
  }
  const last = points[points.length - 1];
  if (last !== undefined) d += ` L${String(last.x)},${String(last.y)}`;
  return d;
}

function dist(a: LayoutPoint, b: LayoutPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Point a fraction `t` of the way from `a` toward `b`. */
function lerp(a: LayoutPoint, b: LayoutPoint, t: number): LayoutPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
