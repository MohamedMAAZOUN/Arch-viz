// ============================================================================
// useResolvedDoc.test.tsx — view state drives the resolved element set
// ============================================================================
// Interaction coverage (issue #16): toggling the layer and moving the MVP
// timeline change which elements resolve as visible. Renders the real
// LayerToggle and a tiny consumer of useResolvedDoc, backed by the live
// DocStore + viewStore — the same wiring the canvas and inspector use.
// ============================================================================

import { parseProjectDocument } from "@arch-vis/schema";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { loadProject } from "@/core/doc/loadProject";
import { useResolvedDoc } from "@/core/doc/useResolvedDoc";
import { useViewStore } from "@/core/state/viewStore";
import LayerToggle from "@/features/layer-toggle/LayerToggle";

// Lists the names of every element the current view resolves as visible.
function ResolvedNames() {
  const resolved = useResolvedDoc();
  return (
    <ul aria-label="resolved">
      {(resolved?.elements ?? []).map((e) => (
        <li key={e.id}>{e.name}</li>
      ))}
    </ul>
  );
}

function loadFixture() {
  const doc = parseProjectDocument({
    $schemaVersion: "1.0.0",
    project: { id: "p", name: "P" },
    mvps: [
      { id: "mvp1", name: "First", order: 1, color: "#111111" },
      { id: "mvp2", name: "Second", order: 2, color: "#222222" },
    ],
    layers: [
      { id: "business", order: 1, label: "Business" },
      { id: "architecture", order: 2, label: "Architecture" },
      { id: "engineering", order: 3, label: "Engineering" },
    ],
    elements: [
      // Visible from the business layer up, present from the first MVP.
      {
        id: "biz",
        type: "service",
        name: "Billing",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
      // Only surfaces at the engineering layer.
      {
        id: "eng",
        type: "service",
        name: "Scheduler",
        minLayer: "engineering",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
      // Business layer, but not introduced until the second MVP.
      {
        id: "later",
        type: "service",
        name: "Analytics",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp2" },
      },
    ],
    connections: [],
  });
  loadProject(doc); // resets to the business layer + latest MVP (mvp2)
}

afterEach(cleanup);

describe("useResolvedDoc — layer + MVP gate the resolved set", () => {
  it("toggling to the engineering layer reveals engineering-only elements", () => {
    loadFixture();
    render(
      <>
        <LayerToggle />
        <ResolvedNames />
      </>,
    );

    // Business layer, latest MVP: business elements show; the engineering one does not.
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.queryByText("Scheduler")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Engineering" }));

    // Engineering layer: the engineering-only element now resolves in.
    expect(screen.getByText("Scheduler")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });

  it("scrubbing the MVP back hides elements introduced later", () => {
    loadFixture();
    render(<ResolvedNames />);

    // At the latest MVP, the later-introduced element is visible.
    expect(screen.getByText("Analytics")).toBeInTheDocument();

    // Moving the timeline back to the first MVP (what the slider does) drops it.
    act(() => {
      useViewStore.getState().setMvp("mvp1");
    });

    expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });
});
