// ============================================================================
// resolve.test.ts — pure logic tests for the core derivation function
// ============================================================================
// The resolve function is the heart of "what does the user see at this view".
// It's pure, so we test it directly with crafted documents.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { parseProjectJson, parseProjectYaml } from "@arch-vis/schema";
import { describe, expect, it } from "vitest";

import { resolve } from "@/core/doc/resolve";

import type { MvpRef, ProjectDocument } from "@arch-vis/schema";

const EXAMPLE_PATH = resolvePath(__dirname, "../../../../../docs/schema-example.yaml");

function loadExample() {
  const text = readFileSync(EXAMPLE_PATH, "utf8");
  const result = parseProjectYaml(text);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("resolve", () => {
  it("hides elements introduced after the current MVP", () => {
    const doc = loadExample();
    const atMvp1 = resolve(doc, "architecture", "mvp1");

    // reviews-service is introducedIn: mvp2; recommendations-service in mvp3
    expect(atMvp1.elements.find((e) => e.id === "reviews-service")).toBeUndefined();
    expect(atMvp1.elements.find((e) => e.id === "recommendations-service")).toBeUndefined();

    // catalog-service is introducedIn: mvp1 — should be present
    expect(atMvp1.elements.find((e) => e.id === "catalog-service")).toBeDefined();
  });

  it("reveals elements as MVPs advance", () => {
    const doc = loadExample();
    const atMvp3 = resolve(doc, "architecture", "mvp3");

    expect(atMvp3.elements.find((e) => e.id === "reviews-service")).toBeDefined();
    expect(atMvp3.elements.find((e) => e.id === "recommendations-service")).toBeDefined();
  });

  it("aggregates children of an aggregateAt group at the business layer", () => {
    const doc = loadExample();
    const atBusiness = resolve(doc, "business", "mvp3");

    // The storefront-domain group aggregateAt: [business], so its children
    // (web-app, catalog-service, etc.) should be hidden, but the group is visible.
    expect(atBusiness.elements.find((e) => e.id === "storefront-domain")).toBeDefined();
    expect(atBusiness.elements.find((e) => e.id === "catalog-service")).toBeUndefined();
    expect(atBusiness.elements.find((e) => e.id === "web-app")).toBeUndefined();
  });

  it("reveals children at the architecture layer (no aggregation there)", () => {
    const doc = loadExample();
    const atArch = resolve(doc, "architecture", "mvp3");

    expect(atArch.elements.find((e) => e.id === "catalog-service")).toBeDefined();
    expect(atArch.elements.find((e) => e.id === "web-app")).toBeDefined();
  });

  it("applies modifiedIn property patches up to the current MVP", () => {
    const doc = loadExample();

    // catalog-service has a description change in mvp3
    const atMvp1 = resolve(doc, "architecture", "mvp1");
    const atMvp3 = resolve(doc, "architecture", "mvp3");

    const cat1 = atMvp1.elements.find((e) => e.id === "catalog-service");
    const cat3 = atMvp3.elements.find((e) => e.id === "catalog-service");

    expect(cat1?.properties.description).toBe("Product browsing and search.");
    expect(cat3?.properties.description).toBe(
      "Product browsing, search, and ML-driven recommendations.",
    );
  });

  it("hides connections when either endpoint is hidden", () => {
    const doc = loadExample();
    const atMvp1 = resolve(doc, "architecture", "mvp1");

    // web-to-reviews is introducedIn: mvp2 AND targets reviews-service (also mvp2)
    expect(atMvp1.connections.find((c) => c.id === "web-to-reviews")).toBeUndefined();

    // catalog-to-recs is introducedIn: mvp3
    expect(atMvp1.connections.find((c) => c.id === "catalog-to-recs")).toBeUndefined();
  });

  it("hides connections that route through aggregated children", () => {
    const doc = loadExample();
    const atBusiness = resolve(doc, "business", "mvp3");

    // web-to-catalog runs between two aggregated children — should be hidden
    expect(atBusiness.connections.find((c) => c.id === "web-to-catalog")).toBeUndefined();
  });

  it("respects minLayer on elements", () => {
    const doc = loadExample();
    const atBusiness = resolve(doc, "business", "mvp3");

    // catalog-db has minLayer: architecture → hidden in business
    expect(atBusiness.elements.find((e) => e.id === "catalog-db")).toBeUndefined();

    // end-user has minLayer: business → visible
    expect(atBusiness.elements.find((e) => e.id === "end-user")).toBeDefined();
  });

  it("ignores modifiedIn patches keyed on an unknown MVP id", () => {
    // Regression: an orphaned modifiedIn entry (its MVP was removed from the
    // doc) must NOT be applied. Unknown ids resolve to Infinity order, so the
    // patch is never <= the current mvpOrder. Previously the fallback was 0,
    // which is <= every real order, so the patch leaked into every view.
    //
    // We assert on a field NO real patch touches, so the orphan can't be
    // masked by a later legitimate patch overwriting the same key.
    const base = loadExample();
    const target = base.elements.find((e) => e.id === "catalog-service");
    if (target === undefined) throw new Error("fixture missing catalog-service");

    const doc = {
      ...base,
      elements: base.elements.map((e) =>
        e.id === "catalog-service"
          ? {
              ...e,
              lifecycle: {
                ...e.lifecycle,
                modifiedIn: {
                  ...e.lifecycle.modifiedIn,
                  // mvp99 does not exist in doc.mvps — orphaned reference.
                  mvp99: { properties: { orphanField: "LEAK" } },
                },
              },
            }
          : e,
      ),
    };

    const atLatest = resolve(doc, "architecture", "mvp3");
    const cat = atLatest.elements.find((e) => e.id === "catalog-service");
    // Under the old fallback-to-0 behavior this would be "LEAK".
    expect(cat?.properties["orphanField"]).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
// Containment (hierarchical view) — issue #1
// ----------------------------------------------------------------------------
// A crafted 3-level document (domain → service → data) plus an outside service
// that connects across boundaries, so we can exercise nesting, the layer +
// override expansion model, and cross-boundary edge rerouting precisely.

function buildNestedDoc(): ProjectDocument {
  const raw = {
    $schemaVersion: "1.0.0",
    project: { id: "nest", name: "Nesting Fixture" },
    mvps: [{ id: "mvp1", name: "v1", order: 1, color: "#3366cc" }],
    layers: [
      { id: "business", order: 1, label: "Business" },
      { id: "architecture", order: 2, label: "Architecture" },
      { id: "engineering", order: 3, label: "Engineering" },
    ],
    elements: [
      {
        id: "domain",
        type: "group",
        name: "Domain",
        minLayer: "business",
        aggregateAt: ["business"],
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
      {
        id: "svc",
        type: "service",
        name: "Service",
        parent: "domain",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
      {
        id: "db",
        type: "database",
        name: "Database",
        parent: "svc",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
      {
        id: "client",
        type: "frontend",
        name: "Client",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
    ],
    connections: [
      {
        id: "client-to-db",
        from: "client",
        to: "db",
        type: "sync",
        minLayer: "business",
        lifecycle: { introducedIn: "mvp1" },
      },
      {
        id: "svc-to-db",
        from: "svc",
        to: "db",
        type: "data",
        minLayer: "architecture",
        lifecycle: { introducedIn: "mvp1" },
      },
    ],
  };
  const result = parseProjectJson(raw);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("resolve — containment", () => {
  it("nests three levels (domain → service → data) at the engineering layer", () => {
    const doc = buildNestedDoc();
    const atEng = resolve(doc, "engineering", "mvp1");

    const ids = new Set(atEng.elements.map((e) => e.id));
    expect(ids.has("domain")).toBe(true);
    expect(ids.has("svc")).toBe(true);
    expect(ids.has("db")).toBe(true);

    expect(atEng.containment.get("domain")?.parentId).toBeNull();
    expect(atEng.containment.get("svc")?.parentId).toBe("domain");
    expect(atEng.containment.get("db")?.parentId).toBe("svc");

    // domain and svc are expanded containers; db is a leaf.
    expect(atEng.containment.get("domain")?.hasVisibleChildren).toBe(true);
    expect(atEng.containment.get("svc")?.hasVisibleChildren).toBe(true);
    expect(atEng.containment.get("db")?.canExpand).toBe(false);
  });

  it("collapses a group by its aggregateAt default at the business layer", () => {
    const doc = buildNestedDoc();
    const atBiz = resolve(doc, "business", "mvp1");

    const ids = new Set(atBiz.elements.map((e) => e.id));
    expect(ids.has("domain")).toBe(true);
    expect(ids.has("svc")).toBe(false);
    expect(ids.has("db")).toBe(false);
    // The collapsed domain advertises that it can be expanded.
    expect(atBiz.containment.get("domain")?.canExpand).toBe(true);
    expect(atBiz.containment.get("domain")?.isExpanded).toBe(false);
  });

  it("lets a manual override expand a default-collapsed group", () => {
    const doc = buildNestedDoc();
    // Override domain → expanded at the business layer, where it would default
    // to collapsed via aggregateAt. Its children become visible and nested.
    const atBiz = resolve(doc, "business", "mvp1", { domain: true });
    expect(atBiz.containment.get("domain")?.isExpanded).toBe(true);
    expect(atBiz.containment.get("domain")?.hasVisibleChildren).toBe(true);
    expect(atBiz.elements.find((e) => e.id === "svc")).toBeDefined();
    expect(atBiz.containment.get("svc")?.parentId).toBe("domain");
  });

  it("lets a manual override collapse a default-expanded element (any type)", () => {
    const doc = buildNestedDoc();
    // Collapse the service (a non-group) at engineering — its db child hides.
    const collapsed = resolve(doc, "engineering", "mvp1", { svc: false });
    const ids = new Set(collapsed.elements.map((e) => e.id));
    expect(ids.has("svc")).toBe(true);
    expect(ids.has("db")).toBe(false);
    expect(collapsed.containment.get("svc")?.hasVisibleChildren).toBe(false);
    expect(collapsed.containment.get("svc")?.canExpand).toBe(true);
  });

  it("reroutes a cross-boundary edge to the nearest visible ancestor when collapsed", () => {
    const doc = buildNestedDoc();
    // Collapse the domain at architecture — db is hidden inside it.
    const collapsed = resolve(doc, "architecture", "mvp1", { domain: false });

    // The client→db connection reroutes to client→domain (aggregated).
    const rerouted = collapsed.edges.find((e) => e.from === "client" && e.to === "domain");
    expect(rerouted).toBeDefined();
    expect(rerouted?.aggregated).toBe(true);

    // The internal svc→db edge collapses to a self-loop and is dropped.
    expect(collapsed.edges.find((e) => e.from === e.to)).toBeUndefined();

    // The real connection list (inspector) does NOT contain the hidden edge.
    expect(collapsed.connections.find((c) => c.id === "client-to-db")).toBeUndefined();
  });

  it("keeps real edges intact when everything is expanded", () => {
    const doc = buildNestedDoc();
    const atArch = resolve(doc, "architecture", "mvp1");
    // client→db is a real, non-aggregated edge with both endpoints visible.
    const edge = atArch.edges.find((e) => e.from === "client" && e.to === "db");
    expect(edge?.aggregated).toBe(false);
    expect(atArch.connections.find((c) => c.id === "client-to-db")).toBeDefined();
  });
});

// ----------------------------------------------------------------------------
// Synthetic edge cases — issue #18
// ----------------------------------------------------------------------------
// The tests above lean on the example project, which is a healthy, "happy"
// document. These exercise the degenerate and boundary shapes the example
// never hits: minimal/empty documents, the full removal lifecycle (the closest
// the schema gets to "removed then reintroduced"), and aggregation collapsing a
// chain that is deeper than the example's two levels.

/** A minimal valid document: one MVP, three layers, one top-level element. */
function buildMinimalDoc(connections: readonly unknown[] = []): ProjectDocument {
  const raw = {
    $schemaVersion: "1.0.0",
    project: { id: "min", name: "Minimal" },
    mvps: [{ id: "mvp1", name: "v1", order: 1, color: "#3366cc" }],
    layers: [
      { id: "business", order: 1, label: "Business" },
      { id: "architecture", order: 2, label: "Architecture" },
      { id: "engineering", order: 3, label: "Engineering" },
    ],
    elements: [
      {
        id: "lonely",
        type: "service",
        name: "Lonely Service",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
    ],
    connections,
  };
  const result = parseProjectJson(raw);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("resolve — degenerate documents", () => {
  it("resolves a single-element document with no connections", () => {
    const doc = buildMinimalDoc();
    const state = resolve(doc, "business", "mvp1");

    expect(state.elements.map((e) => e.id)).toEqual(["lonely"]);
    expect(state.connections).toHaveLength(0);
    expect(state.edges).toHaveLength(0);

    // A lone top-level element has no parent and can't expand.
    const meta = state.containment.get("lonely");
    expect(meta?.parentId).toBeNull();
    expect(meta?.canExpand).toBe(false);
    expect(meta?.hasVisibleChildren).toBe(false);
  });

  it("produces no edges when the connection list is empty", () => {
    const doc = buildMinimalDoc([]);
    expect(resolve(doc, "engineering", "mvp1").edges).toEqual([]);
  });

  it("returns the earliest view (and never throws) for an unknown requested MVP id", () => {
    // mvp99 is not in doc.mvps → its order falls back to 0, the pre-history
    // view. Everything introduced at order ≥ 1 is gated out rather than the
    // function blowing up on a missing lookup.
    const doc = buildMinimalDoc();
    // Cast: deliberately feeding an id outside the document to probe the
    // fail-safe path the typed call sites can't normally reach.
    const state = resolve(doc, "business", "mvp99" as MvpRef);
    expect(state.elements).toHaveLength(0);
    expect(state.connections).toHaveLength(0);
    expect(state.edges).toHaveLength(0);
  });
});

// ----------------------------------------------------------------------------
// Removal lifecycle ("removed then reintroduced")
// ----------------------------------------------------------------------------
// The schema models a single contiguous lifespan per element (`introducedIn`
// .. optional `removedIn`), so a literal remove-then-reintroduce of one id is
// not expressible. What IS expressible — and what the example never exercises —
// is the removal window: an element visible only between its introduction and
// removal, with connections following it in and out.

function buildLifecycleDoc(): ProjectDocument {
  const raw = {
    $schemaVersion: "1.0.0",
    project: { id: "life", name: "Lifecycle Fixture" },
    mvps: [
      { id: "mvp1", name: "v1", order: 1, color: "#111111" },
      { id: "mvp2", name: "v2", order: 2, color: "#222222" },
      { id: "mvp3", name: "v3", order: 3, color: "#333333" },
      { id: "mvp4", name: "v4", order: 4, color: "#444444" },
    ],
    layers: [
      { id: "business", order: 1, label: "Business" },
      { id: "architecture", order: 2, label: "Architecture" },
      { id: "engineering", order: 3, label: "Engineering" },
    ],
    elements: [
      {
        id: "stable",
        type: "service",
        name: "Stable",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
      {
        // Lives only across the mvp2..mvp3 window.
        id: "ghost",
        type: "service",
        name: "Ghost",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp2", removedIn: "mvp4" },
      },
      {
        // Introduced and removed in the same MVP → never visible.
        id: "flicker",
        type: "service",
        name: "Flicker",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp2", removedIn: "mvp2" },
      },
    ],
    connections: [
      {
        id: "stable-to-ghost",
        from: "stable",
        to: "ghost",
        type: "sync",
        minLayer: "business",
        lifecycle: { introducedIn: "mvp2" },
      },
    ],
  };
  const result = parseProjectJson(raw);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("resolve — removal lifecycle", () => {
  it("hides an element before it is introduced", () => {
    const ids = new Set(resolve(buildLifecycleDoc(), "business", "mvp1").elements.map((e) => e.id));
    expect(ids.has("ghost")).toBe(false);
    expect(ids.has("stable")).toBe(true);
  });

  it("shows an element across its visibility window (introducedIn..before removedIn)", () => {
    const doc = buildLifecycleDoc();
    expect(resolve(doc, "business", "mvp2").elements.some((e) => e.id === "ghost")).toBe(true);
    expect(resolve(doc, "business", "mvp3").elements.some((e) => e.id === "ghost")).toBe(true);
  });

  it("hides an element from its removedIn MVP onward (boundary is inclusive)", () => {
    // removedIn is inclusive: the element is already gone *at* the removal MVP.
    const ids = new Set(resolve(buildLifecycleDoc(), "business", "mvp4").elements.map((e) => e.id));
    expect(ids.has("ghost")).toBe(false);
    expect(ids.has("stable")).toBe(true);
  });

  it("never shows an element introduced and removed in the same MVP", () => {
    const doc = buildLifecycleDoc();
    for (const mvp of ["mvp1", "mvp2", "mvp3", "mvp4"] as const) {
      expect(resolve(doc, "business", mvp).elements.some((e) => e.id === "flicker")).toBe(false);
    }
  });

  it("drops a connection while one endpoint is outside its window, restores it inside", () => {
    const doc = buildLifecycleDoc();
    // mvp1: ghost absent → connection gone.
    expect(
      resolve(doc, "business", "mvp1").connections.some((c) => c.id === "stable-to-ghost"),
    ).toBe(false);
    // mvp2/mvp3: both endpoints present → connection visible.
    expect(
      resolve(doc, "business", "mvp2").connections.some((c) => c.id === "stable-to-ghost"),
    ).toBe(true);
    // mvp4: ghost removed → connection gone again (and not rerouted anywhere).
    const atMvp4 = resolve(doc, "business", "mvp4");
    expect(atMvp4.connections.some((c) => c.id === "stable-to-ghost")).toBe(false);
    expect(atMvp4.edges.some((e) => e.from === "stable")).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Deeply nested aggregation
// ----------------------------------------------------------------------------
// The example tops out at two levels of containment. This builds a five-deep
// chain (l0 → l1 → l2 → l3 → leaf) plus an outsider wired to the deepest node,
// so collapsing at the top or the middle exercises the multi-hop ancestor walk
// and edge rerouting that shallow fixtures never reach.

function buildDeepDoc(): ProjectDocument {
  const group = (id: string, parent?: string, aggregateAt: readonly string[] = []) => ({
    id,
    type: "group" as const,
    name: id,
    ...(parent !== undefined ? { parent } : {}),
    aggregateAt,
    minLayer: "business",
    properties: {},
    lifecycle: { introducedIn: "mvp1" },
  });
  const raw = {
    $schemaVersion: "1.0.0",
    project: { id: "deep", name: "Deep Nesting Fixture" },
    mvps: [{ id: "mvp1", name: "v1", order: 1, color: "#3366cc" }],
    layers: [
      { id: "business", order: 1, label: "Business" },
      { id: "architecture", order: 2, label: "Architecture" },
      { id: "engineering", order: 3, label: "Engineering" },
    ],
    elements: [
      group("l0", undefined, ["business"]), // aggregates the whole chain at business
      group("l1", "l0"),
      group("l2", "l1"),
      group("l3", "l2"),
      {
        id: "leaf",
        type: "service",
        name: "Leaf",
        parent: "l3",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
      {
        id: "outside",
        type: "frontend",
        name: "Outside",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
    ],
    connections: [
      {
        id: "outside-to-leaf",
        from: "outside",
        to: "leaf",
        type: "sync",
        minLayer: "business",
        lifecycle: { introducedIn: "mvp1" },
      },
    ],
  };
  const result = parseProjectJson(raw);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("resolve — deeply nested aggregation", () => {
  it("nests the full five-deep chain when everything is expanded", () => {
    const state = resolve(buildDeepDoc(), "engineering", "mvp1");
    const ids = new Set(state.elements.map((e) => e.id));
    for (const id of ["l0", "l1", "l2", "l3", "leaf", "outside"]) {
      expect(ids.has(id)).toBe(true);
    }
    // Parent chain is intact at every level.
    expect(state.containment.get("l1")?.parentId).toBe("l0");
    expect(state.containment.get("l2")?.parentId).toBe("l1");
    expect(state.containment.get("l3")?.parentId).toBe("l2");
    expect(state.containment.get("leaf")?.parentId).toBe("l3");
    // The cross-boundary edge stays 1:1 when nothing is collapsed.
    const edge = state.edges.find((e) => e.from === "outside" && e.to === "leaf");
    expect(edge?.aggregated).toBe(false);
  });

  it("collapsing the top group hides the entire subtree and reroutes the deep edge to it", () => {
    const state = resolve(buildDeepDoc(), "engineering", "mvp1", { l0: false });
    const ids = new Set(state.elements.map((e) => e.id));
    expect(ids.has("l0")).toBe(true);
    expect(ids.has("outside")).toBe(true);
    for (const hidden of ["l1", "l2", "l3", "leaf"]) {
      expect(ids.has(hidden)).toBe(false);
    }
    expect(state.containment.get("l0")?.canExpand).toBe(true);
    expect(state.containment.get("l0")?.isExpanded).toBe(false);

    // outside→leaf collapses up four levels to outside→l0.
    const rerouted = state.edges.find((e) => e.from === "outside" && e.to === "l0");
    expect(rerouted?.aggregated).toBe(true);
    expect(state.edges.find((e) => e.to === "leaf")).toBeUndefined();
  });

  it("collapsing a middle group reroutes the deep edge to that middle ancestor", () => {
    // l2 collapsed: l0, l1, l2 stay visible; l3 and leaf hide beneath it.
    const state = resolve(buildDeepDoc(), "engineering", "mvp1", { l2: false });
    const ids = new Set(state.elements.map((e) => e.id));
    expect(ids.has("l2")).toBe(true);
    expect(ids.has("l3")).toBe(false);
    expect(ids.has("leaf")).toBe(false);

    // leaf's nearest *visible* ancestor is the collapsed-but-visible l2.
    const rerouted = state.edges.find((e) => e.from === "outside" && e.to === "l2");
    expect(rerouted?.aggregated).toBe(true);
  });

  it("aggregates the whole chain by the top group's aggregateAt default at the business layer", () => {
    // No override: l0 declares aggregateAt:[business], so the business view
    // collapses the entire chain into l0 with no manual interaction.
    const state = resolve(buildDeepDoc(), "business", "mvp1");
    const ids = new Set(state.elements.map((e) => e.id));
    expect(ids.has("l0")).toBe(true);
    expect(ids.has("outside")).toBe(true);
    for (const hidden of ["l1", "l2", "l3", "leaf"]) {
      expect(ids.has(hidden)).toBe(false);
    }
    expect(state.edges.find((e) => e.from === "outside" && e.to === "l0")?.aggregated).toBe(true);
  });
});
