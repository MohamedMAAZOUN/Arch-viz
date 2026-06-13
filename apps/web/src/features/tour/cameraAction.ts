// ============================================================================
// cameraAction — pure: a tour Viewpoint → what the camera should do
// ============================================================================
// Keeps the "which camera move?" decision out of the Canvas (where it would be
// tangled with React Flow) so it can be unit-tested in isolation. The Canvas
// maps the returned action onto its React Flow instance.
//
// Precedence (first match wins):
//   1. fit: "all"            → frame the whole graph
//   2. focus: <id>           → frame that element (optionally at a target zoom)
//   3. fit: "focus" w/o id   → fall back to framing the whole graph
//   4. explicit x / y        → recenter on that world point (optional zoom)
//   5. otherwise             → do nothing (inherit the current camera)
// ============================================================================

import type { Viewpoint } from "@arch-vis/schema";

export type CameraAction =
  | { kind: "fitAll" }
  | { kind: "focus"; id: string; zoom: number | null }
  | { kind: "center"; x: number; y: number; zoom: number | null }
  | { kind: "none" };

export function resolveCameraAction(viewpoint: Viewpoint): CameraAction {
  if (viewpoint.fit === "all") return { kind: "fitAll" };
  if (viewpoint.focus !== undefined) {
    return { kind: "focus", id: viewpoint.focus, zoom: viewpoint.zoom ?? null };
  }
  if (viewpoint.fit === "focus") return { kind: "fitAll" }; // no target to focus
  if (viewpoint.x !== undefined && viewpoint.y !== undefined) {
    return { kind: "center", x: viewpoint.x, y: viewpoint.y, zoom: viewpoint.zoom ?? null };
  }
  return { kind: "none" };
}
