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

describe("DocStore — documentation & annotations", () => {
  it("sets and clears element documentation", () => {
    const store = createDocStore();
    store.load(fixture());
    store.updateElementDocumentation("svc-a", "# Hello");
    expect(store.get()?.elements[0]?.documentation).toBe("# Hello");
    store.updateElementDocumentation("svc-a", null);
    expect(store.get()?.elements[0]?.documentation).toBeUndefined();
  });

  it("adds and removes annotations, dropping the empty array", () => {
    const store = createDocStore();
    store.load(fixture());
    store.addAnnotation("svc-a", {
      id: "note-1",
      body: "First",
      createdAt: "2026-01-01T00:00:00Z",
    });
    store.addAnnotation("svc-a", {
      id: "note-2",
      body: "Second",
      createdAt: "2026-01-02T00:00:00Z",
    });
    expect(store.get()?.elements[0]?.annotations).toHaveLength(2);

    store.removeAnnotation("svc-a", "note-1");
    expect(store.get()?.elements[0]?.annotations).toHaveLength(1);
    expect(store.get()?.elements[0]?.annotations?.[0]?.id).toBe("note-2");

    store.removeAnnotation("svc-a", "note-2");
    expect(store.get()?.elements[0]?.annotations).toBeUndefined();
  });
});

describe("DocStore — structural mutations", () => {
  it("adds and removes an element", () => {
    const store = createDocStore();
    store.load(fixture());
    store.addElement({
      id: "svc-b",
      type: "service",
      name: "Svc B",
      minLayer: "architecture",
      properties: {},
      lifecycle: { introducedIn: "mvp1" },
    });
    expect(store.get()?.elements).toHaveLength(2);
    store.removeElement("svc-b");
    expect(store.get()?.elements).toHaveLength(1);
  });

  it("throws on a duplicate element id", () => {
    const store = createDocStore();
    store.load(fixture());
    expect(() => {
      store.addElement({
        id: "svc-a",
        type: "service",
        name: "Dup",
        minLayer: "architecture",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      });
    }).toThrow(/duplicate element id/);
  });

  it("removing an element cascades to its subtree, connections, and overrides", () => {
    const store = createDocStore();
    store.load(fixture());
    // Build a group with a child and a connection to svc-a, plus a layout override.
    store.addElement({
      id: "grp",
      type: "group",
      name: "Group",
      aggregateAt: [],
      minLayer: "business",
      properties: {},
      lifecycle: { introducedIn: "mvp1" },
    });
    store.addElement({
      id: "child",
      type: "service",
      name: "Child",
      parent: "grp",
      minLayer: "architecture",
      properties: {},
      lifecycle: { introducedIn: "mvp1" },
    });
    store.addConnection({
      id: "conn-1",
      from: "child",
      to: "svc-a",
      type: "sync",
      minLayer: "architecture",
      lifecycle: { introducedIn: "mvp1" },
    });
    store.setElementLayoutOverride("architecture", "child", { x: 5, y: 5 });

    store.removeElement("grp");

    const doc = store.get();
    expect(doc?.elements.map((e) => e.id)).toEqual(["svc-a"]);
    expect(doc?.connections).toHaveLength(0);
    expect(doc?.layout?.architecture).toBeUndefined();
  });

  it("adds and removes a connection", () => {
    const store = createDocStore();
    store.load(fixture());
    store.addElement({
      id: "svc-b",
      type: "service",
      name: "Svc B",
      minLayer: "architecture",
      properties: {},
      lifecycle: { introducedIn: "mvp1" },
    });
    store.addConnection({
      id: "conn-1",
      from: "svc-a",
      to: "svc-b",
      type: "sync",
      minLayer: "architecture",
      lifecycle: { introducedIn: "mvp1" },
    });
    expect(store.get()?.connections).toHaveLength(1);
    store.removeConnection("conn-1");
    expect(store.get()?.connections).toHaveLength(0);
  });
});
