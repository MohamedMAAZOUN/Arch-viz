// ============================================================================
// buildLayoutTree.test.ts — the resolved-elements → ELK forest transform
// ============================================================================

import { describe, expect, it } from "vitest";

import { buildLayoutTree } from "@/features/canvas/buildLayoutTree";
import { CONTAINER_PADDING, NODE_DIMENSIONS } from "@/features/canvas/types";

import type { Containment } from "@/core/doc/resolve";
import type { Element } from "@/core/schema/schema";

// Minimal element factory — only the fields buildLayoutTree reads matter.
function el(id: string, type: Element["type"] = "service"): Element {
  return {
    id,
    type,
    name: id,
    minLayer: "business",
    properties: {},
    lifecycle: { introducedIn: "mvp1" },
    ...(type === "group" ? { aggregateAt: [] } : {}),
  } as Element;
}

function containment(entries: Record<string, Partial<Containment>>): Map<string, Containment> {
  const map = new Map<string, Containment>();
  for (const [id, c] of Object.entries(entries)) {
    map.set(id, {
      parentId: c.parentId ?? null,
      canExpand: c.canExpand ?? false,
      isExpanded: c.isExpanded ?? false,
      hasVisibleChildren: c.hasVisibleChildren ?? false,
    });
  }
  return map;
}

describe("buildLayoutTree", () => {
  it("builds a flat forest when nothing nests", () => {
    const elements = [el("a"), el("b")];
    const tree = buildLayoutTree(elements, containment({ a: {}, b: {} }));

    expect(tree).toHaveLength(2);
    expect(tree.every((n) => n.children === undefined)).toBe(true);
    expect(tree[0]?.width).toBe(NODE_DIMENSIONS.default.width);
  });

  it("nests children under an expanded container and gives it header padding", () => {
    const elements = [el("domain", "group"), el("svc"), el("db", "database")];
    const tree = buildLayoutTree(
      elements,
      containment({
        domain: { hasVisibleChildren: true },
        svc: { parentId: "domain", hasVisibleChildren: true },
        db: { parentId: "svc" },
      }),
    );

    expect(tree).toHaveLength(1);
    const domain = tree[0];
    expect(domain?.id).toBe("domain");
    expect(domain?.padding).toEqual(CONTAINER_PADDING);
    expect(domain?.children).toHaveLength(1);

    // Three levels deep: domain → svc → db.
    const svc = domain?.children?.[0];
    expect(svc?.id).toBe("svc");
    expect(svc?.children?.[0]?.id).toBe("db");
    expect(svc?.children?.[0]?.children).toBeUndefined();
  });

  it("treats a collapsed parent as a leaf (no children emitted)", () => {
    const elements = [el("domain", "group"), el("svc")];
    // svc is hidden by collapse, so it isn't in the element list at all.
    const tree = buildLayoutTree(
      elements.filter((e) => e.id !== "svc"),
      containment({ domain: { canExpand: true, hasVisibleChildren: false } }),
    );

    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toBeUndefined();
    expect(tree[0]?.width).toBe(NODE_DIMENSIONS.group.width);
  });
});
