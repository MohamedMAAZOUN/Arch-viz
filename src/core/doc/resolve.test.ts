// ============================================================================
// resolve.test.ts — pure logic tests for the core derivation function
// ============================================================================
// The resolve function is the heart of "what does the user see at this view".
// It's pure, so we test it directly with crafted documents.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { describe, expect, it } from "vitest";

import { resolve } from "@/core/doc/resolve";
import { parseProjectJson, parseProjectYaml } from "@/core/schema/parse";

import type { ProjectDocument } from "@/core/schema/schema";

const EXAMPLE_PATH = resolvePath(__dirname, "../../../docs/schema-example.yaml");

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
