// ============================================================================
// TopBar.test.tsx — the Save button reflects dirty state
// ============================================================================
// Interaction coverage (issue #16): the Save action is disabled with no
// project, idle ("saved") on a clean document, and active ("save") once the
// document diverges from its committed snapshot. Exercises the real
// useDirty → DocStore wiring.
// ============================================================================

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { docStore } from "@/core/doc/DocStore";
import { loadProject } from "@/core/doc/loadProject";
import { parseProjectDocument } from "@/core/schema/schema";
import TopBar from "@/features/topbar/TopBar";

function loadFixture() {
  const doc = parseProjectDocument({
    $schemaVersion: "1.0.0",
    project: { id: "p", name: "Acme Platform" },
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

afterEach(cleanup);

describe("TopBar — Save button dirty state", () => {
  it("is idle ('saved') on a freshly loaded, clean document", () => {
    loadFixture();
    render(<TopBar />);

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    expect(save).toHaveTextContent("saved");
    expect(save).toHaveAttribute("title", "Nothing to save");
  });

  it("becomes active ('save') once the document is mutated", () => {
    loadFixture();
    render(<TopBar />);

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveTextContent("saved");

    act(() => {
      docStore.updateElementName("svc-a", "Orders v2");
    });

    expect(save).toHaveTextContent("save");
    expect(save).toHaveAttribute("title", expect.stringContaining("Save changes"));
  });
});
