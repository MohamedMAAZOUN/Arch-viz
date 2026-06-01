// ============================================================================
// authoring.test.ts — new-element / new-connection factories
// ============================================================================
// Builders feed straight into the document, so the shapes they produce must be
// valid. We parse them through the real schema rather than asserting on fields.
// ============================================================================

import { describe, expect, it } from "vitest";

import { buildConnection, buildElement } from "@/core/doc/authoring";
import { ProjectDocument } from "@/core/schema/schema";

function docWith(elements: unknown[], connections: unknown[] = []): unknown {
  return {
    $schemaVersion: "1.0.0",
    project: { id: "p", name: "P", theme: "default" },
    mvps: [{ id: "mvp1", name: "L", order: 1, color: "#000000" }],
    layers: [
      { id: "business", order: 1, label: "B" },
      { id: "architecture", order: 2, label: "A" },
      { id: "engineering", order: 3, label: "E" },
    ],
    elements,
    connections,
  };
}

describe("buildElement", () => {
  it("produces a schema-valid element", () => {
    const el = buildElement({ type: "service", takenIds: new Set(), introducedIn: "mvp1" });
    const result = ProjectDocument.safeParse(docWith([el]));
    expect(result.success).toBe(true);
  });

  it("gives groups the aggregateAt field", () => {
    const el = buildElement({ type: "group", takenIds: new Set(), introducedIn: "mvp1" });
    expect(el.type).toBe("group");
    if (el.type === "group") expect(el.aggregateAt).toEqual([]);
  });

  it("never collides with a taken id", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const el = buildElement({ type: "service", takenIds: taken, introducedIn: "mvp1" });
      expect(taken.has(el.id)).toBe(false);
      taken.add(el.id);
    }
  });
});

describe("buildConnection", () => {
  it("produces a schema-valid connection between existing elements", () => {
    const a = buildElement({ type: "service", takenIds: new Set(), introducedIn: "mvp1" });
    const b = buildElement({ type: "database", takenIds: new Set([a.id]), introducedIn: "mvp1" });
    const conn = buildConnection({
      from: a.id,
      to: b.id,
      takenIds: new Set(),
      introducedIn: "mvp1",
      minLayer: "architecture",
    });
    const result = ProjectDocument.safeParse(docWith([a, b], [conn]));
    expect(result.success).toBe(true);
  });
});
