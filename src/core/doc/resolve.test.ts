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
import { parseProjectYaml } from "@/core/schema/parse";

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
