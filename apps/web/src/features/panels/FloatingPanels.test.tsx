// ============================================================================
// FloatingPanels.test.tsx — selecting an element populates the inspector
// ============================================================================
// Interaction coverage (issue #16): the right (inspector) panel follows the
// selection store. With nothing selected it shows the hint; selecting an
// element opens the panel and renders that element's inspector sections.
// ============================================================================

import { parseProjectDocument } from "@arch-vis/schema";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { loadProject } from "@/core/doc/loadProject";
import { useSelectionStore } from "@/core/state/selectionStore";
import FloatingPanels from "@/features/panels/FloatingPanels";

function loadFixture() {
  const doc = parseProjectDocument({
    $schemaVersion: "1.0.0",
    project: { id: "p", name: "P" },
    mvps: [{ id: "mvp1", name: "First", order: 1, color: "#112233" }],
    layers: [
      { id: "business", order: 1, label: "Business" },
      { id: "architecture", order: 2, label: "Architecture" },
      { id: "engineering", order: 3, label: "Engineering" },
    ],
    elements: [
      {
        id: "svc-a",
        type: "service",
        name: "Orders",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
    ],
    connections: [],
  });
  loadProject(doc);
}

afterEach(() => {
  cleanup();
  useSelectionStore.getState().clear();
});

describe("FloatingPanels — inspector follows selection", () => {
  it("renders the selected element's inspector sections", () => {
    loadFixture();
    render(<FloatingPanels />);

    // No element selected yet — the inspector is not showing element fields.
    expect(screen.queryByRole("button", { name: "Edit element name" })).not.toBeInTheDocument();

    act(() => {
      useSelectionStore.getState().select("svc-a");
    });

    // The inspector now shows the selected element, populated from the doc.
    expect(screen.getByRole("button", { name: "Edit element name" })).toHaveTextContent("Orders");
  });
});
