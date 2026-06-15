// ============================================================================
// TopBar.test.tsx — the Save button reflects state (dirty + provenance)
// ============================================================================
// Interaction coverage (issues #16, #64): for a server-backed project the Save
// action is idle ("saved") on a clean document and active ("save") once it
// diverges; for a local-only document it reads "save to server" (the prompt to
// persist). Exercises the real useDirty → DocStore wiring plus the project
// context store.
// ============================================================================

import { parseProjectDocument } from "@arch-vis/schema";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { docStore } from "@/core/doc/DocStore";
import { loadProject } from "@/core/doc/loadProject";
import { useProjectContextStore } from "@/core/state/projectContextStore";
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

/** loadProject clears the server context; make the open document server-backed. */
function asServerProject() {
  useProjectContextStore.getState().setServerProject({ id: "p", name: "Acme", role: "owner", version: 1 });
}

afterEach(() => {
  cleanup();
  useProjectContextStore.getState().setServerProject(null);
});

describe("TopBar — Save button state", () => {
  it("is idle ('saved') on a clean, server-backed document", () => {
    loadFixture();
    asServerProject();
    render(<TopBar />);

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    expect(save).toHaveTextContent("saved");
    expect(save).toHaveAttribute("title", "Up to date with the server");
  });

  it("becomes active ('save') once a server-backed document is mutated", () => {
    loadFixture();
    asServerProject();
    render(<TopBar />);

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveTextContent("saved");

    act(() => {
      docStore.updateElementName("svc-a", "Orders v2");
    });

    expect(save).toHaveTextContent("save");
    expect(save).toHaveAttribute("title", expect.stringContaining("Commit a snapshot"));
  });

  it("reads 'save to server' for a local-only document", () => {
    loadFixture();
    render(<TopBar />);

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveTextContent("save to server");
    expect(save).toHaveAttribute("title", expect.stringContaining("Save this project to the server"));
  });
});
