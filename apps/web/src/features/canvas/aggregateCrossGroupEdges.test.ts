// ============================================================================
// aggregateCrossGroupEdges.test.ts
// ============================================================================

import { describe, expect, it } from "vitest";

import { aggregateCrossGroupEdges } from "@/features/canvas/aggregateCrossGroupEdges";

import type { ResolvedEdge } from "@/core/doc/resolve";
import type { Element } from "@arch-vis/schema";

function el(id: string, type: Element["type"], parent?: string): Element {
  return {
    id,
    type,
    name: id,
    minLayer: "business",
    properties: {},
    lifecycle: { introducedIn: "mvp1" },
    ...(parent !== undefined ? { parent } : {}),
    ...(type === "group" ? { aggregateAt: [] } : {}),
  } as Element;
}

function edge(id: string, from: string, to: string): ResolvedEdge {
  return { id, from, to, type: "sync", aggregated: false, count: 1 };
}

// Two domains, each with two services; plus a free-standing actor.
const elements: Element[] = [
  el("A", "group"),
  el("a1", "service", "A"),
  el("a2", "service", "A"),
  el("B", "group"),
  el("b1", "service", "B"),
  el("b2", "service", "B"),
  el("actor", "actor"),
];
const elementById = new Map(elements.map((e) => [e.id, e]));
const visibleIds = new Set(elements.map((e) => e.id));

describe("aggregateCrossGroupEdges", () => {
  it("bundles every cross-group link into one ×N edge per group pair", () => {
    const edges = [edge("e1", "a1", "b1"), edge("e2", "a2", "b2"), edge("e3", "b1", "a1")];
    const out = aggregateCrossGroupEdges(edges, elementById, visibleIds, null);

    expect(out).toHaveLength(1);
    expect(out[0]?.aggregated).toBe(true);
    expect(out[0]?.count).toBe(3);
    // Endpoints collapse to the two group containers.
    expect([out[0]?.from, out[0]?.to].sort()).toEqual(["A", "B"]);
  });

  it("leaves intra-group and ungrouped links alone", () => {
    const edges = [edge("intra", "a1", "a2"), edge("toActor", "a1", "actor")];
    const out = aggregateCrossGroupEdges(edges, elementById, visibleIds, null);

    expect(out).toHaveLength(2);
    expect(out.every((e) => !e.aggregated)).toBe(true);
  });

  it("keeps the real edge when it touches the focused node", () => {
    const edges = [edge("e1", "a1", "b1"), edge("e2", "a2", "b2")];
    const focus = new Set(["a1", "b1"]);
    const out = aggregateCrossGroupEdges(edges, elementById, visibleIds, focus);

    // e1 (focused) stays real; e2 bundles.
    const real = out.find((e) => e.id === "e1");
    const bundle = out.find((e) => e.aggregated);
    expect(real).toBeDefined();
    expect(bundle?.count).toBe(1);
  });
});
