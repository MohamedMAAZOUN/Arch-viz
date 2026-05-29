// ============================================================================
// DocStore.test.ts — mutation operations
// ============================================================================
// Focuses on path-aware property updates because the recursive object
// merge/prune logic is easy to get subtly wrong (and is shared across every
// inspector field edit).
// ============================================================================

import { describe, expect, it } from "vitest";

import { createDocStore } from "@/core/doc/DocStore";

import type { ProjectDocument } from "@/core/schema/schema";

// Minimal valid document fixture — covers the schema shape we exercise here
// without dragging in the full example YAML for every test.
function fixture(): ProjectDocument {
  return {
    $schemaVersion: "1.0.0",
    project: { id: "p", name: "P", theme: "default" },
    mvps: [{ id: "mvp1", name: "L", order: 1, color: "#000" }],
    layers: [
      { id: "business", order: 1, label: "B" },
      { id: "architecture", order: 2, label: "A" },
      { id: "engineering", order: 3, label: "E" },
    ],
    elements: [
      {
        id: "svc-a",
        type: "service",
        name: "Svc A",
        minLayer: "architecture",
        properties: {
          owner: "team-a",
          tech: { language: "Rust", runtime: "tokio" },
        },
        lifecycle: { introducedIn: "mvp1" },
      },
    ],
    connections: [],
  };
}

describe("DocStore — mutations", () => {
  it("updates a top-level property", () => {
    const store = createDocStore();
    store.load(fixture());
    store.updateElementProperty("svc-a", "owner", "team-b");
    const el = store.get()?.elements.find((e) => e.id === "svc-a");
    expect(el?.properties.owner).toBe("team-b");
  });

  it("removes a property when value is null", () => {
    const store = createDocStore();
    store.load(fixture());
    store.updateElementProperty("svc-a", "owner", null);
    const el = store.get()?.elements.find((e) => e.id === "svc-a");
    expect(el?.properties.owner).toBeUndefined();
  });

  it("updates a nested property by path", () => {
    const store = createDocStore();
    store.load(fixture());
    store.updateElementPropertyPath("svc-a", ["tech", "language"], "Go");
    const el = store.get()?.elements.find((e) => e.id === "svc-a");
    expect((el?.properties["tech"] as { language: string }).language).toBe("Go");
    // sibling preserved
    expect((el?.properties["tech"] as { runtime: string }).runtime).toBe("tokio");
  });

  it("creates intermediate objects when the path doesn't exist", () => {
    const store = createDocStore();
    store.load(fixture());
    store.updateElementPropertyPath("svc-a", ["sla", "p99Ms"], 250);
    const el = store.get()?.elements.find((e) => e.id === "svc-a");
    expect((el?.properties["sla"] as { p99Ms: number }).p99Ms).toBe(250);
  });

  it("prunes empty parent objects when removing the last leaf", () => {
    const store = createDocStore();
    store.load(fixture());
    store.updateElementPropertyPath("svc-a", ["tech", "language"], null);
    store.updateElementPropertyPath("svc-a", ["tech", "runtime"], null);
    const el = store.get()?.elements.find((e) => e.id === "svc-a");
    expect(el?.properties["tech"]).toBeUndefined();
  });

  it("undoes the last user action (mutations within captureTimeout merge)", () => {
    const store = createDocStore();
    store.load(fixture());
    // These two synchronous mutations land in the same undo step because
    // they fall inside Y.UndoManager's captureTimeout window. That's the
    // intended UX — typing into a field undoes as one action, not per-key.
    store.updateElementProperty("svc-a", "owner", "step-1");
    store.updateElementProperty("svc-a", "owner", "step-2");
    expect(store.canUndo()).toBe(true);
    expect(store.get()?.elements[0]?.properties.owner).toBe("step-2");
    store.undo();
    expect(store.get()?.elements[0]?.properties.owner).toBe("team-a");
  });

  it("sets and clears layer overrides", () => {
    const store = createDocStore();
    store.load(fixture());
    store.setElementLayoutOverride("architecture", "svc-a", { x: 100, y: 50 });
    expect(store.get()?.layout?.architecture?.["svc-a"]?.position).toEqual({ x: 100, y: 50 });
    store.setElementLayoutOverride("architecture", "svc-a", null);
    // Pruned because layer is now empty
    expect(store.get()?.layout?.architecture).toBeUndefined();
  });

  it("clearLayerOverrides wipes a whole layer", () => {
    const store = createDocStore();
    store.load(fixture());
    store.setElementLayoutOverride("architecture", "svc-a", { x: 1, y: 2 });
    store.clearLayerOverrides("architecture");
    expect(store.get()?.layout?.architecture).toBeUndefined();
  });
});
