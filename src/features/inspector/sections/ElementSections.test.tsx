// ============================================================================
// ElementSections.test.tsx — inspector edit ⇆ DocStore round-trip
// ============================================================================
// The first React Testing Library coverage of the inspector (issue #16). These
// assert the real interaction wiring — a field edit reaches the DocStore and
// the re-render reflects it — using the live schema parser and DocStore, never
// a mock. They complement the pure-logic DocStore.test.ts.
// ============================================================================

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { docStore } from "@/core/doc/DocStore";
import { loadProject } from "@/core/doc/loadProject";
import { parseProjectDocument } from "@/core/schema/schema";
import { useSelectionStore } from "@/core/state/selectionStore";
import { useViewStore } from "@/core/state/viewStore";
import ElementSections from "@/features/inspector/sections/ElementSections";


import type { ProjectDocument } from "@/core/schema/schema";

// A minimal but schema-valid two-element document. Parsed through the real Zod
// schema so the test exercises the same trust boundary the app does.
function loadFixture(): ProjectDocument {
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
        properties: { owner: "team-a" },
        lifecycle: { introducedIn: "mvp1" },
      },
    ],
    connections: [],
  });
  loadProject(doc);
  return doc;
}

afterEach(() => {
  cleanup();
  useSelectionStore.getState().clear();
});

describe("ElementSections — edit reaches the DocStore and re-renders", () => {
  it("editing the name commits to the DocStore and updates the view", () => {
    loadFixture();
    render(<ElementSections elementId="svc-a" />);

    // Enter edit mode on the name field, type a new value, commit with Enter.
    fireEvent.click(screen.getByRole("button", { name: "Edit element name" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Orders v2" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // The mutation landed in the document...
    expect(docStore.get()?.elements.find((e) => e.id === "svc-a")?.name).toBe("Orders v2");
    // ...and the inspector re-rendered to show it.
    expect(screen.getByRole("button", { name: "Edit element name" })).toHaveTextContent("Orders v2");
  });

  it("editing the owner property flows through updateElementProperty", () => {
    loadFixture();
    render(<ElementSections elementId="svc-a" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit owner" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "team-b" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(docStore.get()?.elements.find((e) => e.id === "svc-a")?.properties.owner).toBe("team-b");
  });

  it("shows a not-visible message when the element is hidden at the current view", () => {
    loadFixture();
    // Force a layer where the (business-min) element is still visible, then
    // select an id that doesn't resolve — the inspector explains the absence.
    useViewStore.getState().setLayer("engineering");
    render(<ElementSections elementId="does-not-exist" />);
    expect(screen.getByText(/not visible at the current layer/i)).toBeInTheDocument();
  });
});
