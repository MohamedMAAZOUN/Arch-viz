// ============================================================================
// cameraAction.test.ts — Viewpoint → CameraAction precedence
// ============================================================================

import { describe, expect, it } from "vitest";

import { resolveCameraAction } from "@/features/tour/cameraAction";

import type { Viewpoint } from "@arch-vis/schema";

describe("resolveCameraAction", () => {
  it("frames the whole graph for fit:all (highest precedence)", () => {
    const vp: Viewpoint = { fit: "all", focus: "ignored", x: 1, y: 2 };
    expect(resolveCameraAction(vp)).toEqual({ kind: "fitAll" });
  });

  it("focuses an element, carrying the target zoom", () => {
    const vp: Viewpoint = { focus: "payment-service", zoom: 1.5 };
    expect(resolveCameraAction(vp)).toEqual({
      kind: "focus",
      id: "payment-service",
      zoom: 1.5,
    });
  });

  it("focuses with null zoom when none is given", () => {
    expect(resolveCameraAction({ focus: "svc" })).toEqual({
      kind: "focus",
      id: "svc",
      zoom: null,
    });
  });

  it("falls back to fitAll when fit:focus has no target", () => {
    expect(resolveCameraAction({ fit: "focus" })).toEqual({ kind: "fitAll" });
  });

  it("recenters on explicit coordinates", () => {
    expect(resolveCameraAction({ x: 100, y: 200, zoom: 2 })).toEqual({
      kind: "center",
      x: 100,
      y: 200,
      zoom: 2,
    });
  });

  it("does nothing for an empty viewpoint", () => {
    expect(resolveCameraAction({})).toEqual({ kind: "none" });
  });

  it("requires BOTH x and y to recenter", () => {
    expect(resolveCameraAction({ x: 100 })).toEqual({ kind: "none" });
  });
});
