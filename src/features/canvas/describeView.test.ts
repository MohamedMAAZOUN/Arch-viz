// ============================================================================
// describeView.test — the canvas screen-reader announcement
// ============================================================================

import { describe, expect, it } from "vitest";

import { parseProjectDocument } from "@/core/schema/schema";
import { describeView } from "@/features/canvas/describeView";

const doc = parseProjectDocument({
  $schemaVersion: "1.0.0",
  project: { id: "p", name: "P" },
  mvps: [{ id: "mvp1", name: "Public beta", order: 1, color: "#111111" }],
  layers: [
    { id: "business", order: 1, label: "Business" },
    { id: "architecture", order: 2, label: "Architecture" },
    { id: "engineering", order: 3, label: "Engineering" },
  ],
  elements: [
    {
      id: "billing",
      type: "service",
      name: "Billing",
      minLayer: "business",
      properties: {},
      lifecycle: { introducedIn: "mvp1" },
    },
  ],
  connections: [],
});

describe("describeView", () => {
  it("reports no project when the doc is null", () => {
    expect(describeView(null, "architecture", null, null, 0)).toBe("No project loaded.");
  });

  it("names the layer and MVP and reports an empty selection", () => {
    expect(describeView(doc, "architecture", "mvp1", null, 0)).toBe(
      "Architecture layer. MVP Public beta. Nothing selected.",
    );
  });

  it("names a single selected element", () => {
    expect(describeView(doc, "business", "mvp1", "billing", 1)).toBe(
      "Business layer. MVP Public beta. Selected Billing.",
    );
  });

  it("summarizes a multi-selection by count", () => {
    expect(describeView(doc, "engineering", "mvp1", "billing", 3)).toBe(
      "Engineering layer. MVP Public beta. 3 elements selected.",
    );
  });

  it("omits the MVP clause when none is set", () => {
    expect(describeView(doc, "architecture", null, null, 0)).toBe(
      "Architecture layer. Nothing selected.",
    );
  });
});
