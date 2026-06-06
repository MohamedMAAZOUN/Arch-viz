// ============================================================================
// useLayoutedGraph.test.tsx — layout results survive effect re-runs
// ============================================================================
// Regression coverage for the "blank canvas on first load" bug. The hook
// dedupes ELK calls by topology and used to cancel the in-flight layout in the
// effect cleanup. That combination dropped the only layout result whenever the
// effect re-ran WITHOUT re-dispatching — which happens on React StrictMode's
// mount→unmount→mount and on any non-topology doc change (a drag or edit) while
// the first layout is still pending. The fix tags each dispatch with a
// generation and applies a result while it is still the latest, instead of
// cancelling on cleanup.
//
// We replace the real ELK engine with a controllable fake so a layout stays
// "in flight" until the test resolves it — exactly the window the bug lived in.
// ============================================================================

import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { docStore } from "@/core/doc/DocStore";
import { loadProject } from "@/core/doc/loadProject";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { parseProjectDocument } from "@/core/schema/schema";
import { useViewStore } from "@/core/state/viewStore";
import { useLayoutedGraph } from "@/features/canvas/useLayoutedGraph";

import type { LayoutNode, LayoutResult, LayoutResultNode } from "@/core/layout/LayoutEngine";

// A fake layout engine whose every call parks a resolver in `pending`. Calling
// a resolver flattens the tree it was handed into a placement map — so the
// number of placements equals the number of nodes that were laid out.
const harness = vi.hoisted(() => {
  const pending: (() => void)[] = [];
  const layout = vi.fn(
    (nodes: readonly LayoutNode[]) =>
      new Promise<LayoutResult>((resolve) => {
        pending.push(() => {
          const flat = new Map<string, LayoutResultNode>();
          const walk = (ns: readonly LayoutNode[], parentId: string | null) => {
            for (const n of ns) {
              flat.set(n.id, { id: n.id, x: 0, y: 0, width: n.width, height: n.height, parentId });
              if (n.children !== undefined) walk(n.children, n.id);
            }
          };
          walk(nodes, null);
          resolve({ nodes: flat });
        });
      }),
  );
  return { pending, layout };
});

vi.mock("@/core/layout/ElkLayoutEngine", () => ({
  elkLayoutEngine: { layout: harness.layout },
}));

function Probe() {
  const doc = useDocSnapshot();
  const layer = useViewStore((s) => s.currentLayer);
  const { placements, isLaying } = useLayoutedGraph(doc, layer);
  return (
    <>
      <div data-testid="count">{placements.size}</div>
      <div data-testid="laying">{isLaying ? "yes" : "no"}</div>
    </>
  );
}

function loadFixture() {
  const doc = parseProjectDocument({
    $schemaVersion: "1.0.0",
    project: { id: "p", name: "P" },
    mvps: [{ id: "mvp1", name: "First", order: 1, color: "#111111" }],
    layers: [
      { id: "business", order: 1, label: "Business" },
      { id: "architecture", order: 2, label: "Architecture" },
      { id: "engineering", order: 3, label: "Engineering" },
    ],
    elements: [
      {
        id: "biz",
        type: "service",
        name: "Billing",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
      {
        id: "store",
        type: "database",
        name: "Store",
        minLayer: "business",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
      // Only resolves in at the engineering layer — lets a layer switch change
      // the laid-out node count from 2 to 3.
      {
        id: "eng",
        type: "service",
        name: "Scheduler",
        minLayer: "engineering",
        properties: {},
        lifecycle: { introducedIn: "mvp1" },
      },
    ],
    connections: [],
  });
  loadProject(doc); // business layer, latest MVP
}

afterEach(() => {
  cleanup();
  harness.pending.length = 0;
  harness.layout.mockClear();
});

/** Resolve the parked layout at `index` and flush the resulting state update. */
async function resolveLayout(index: number): Promise<void> {
  await act(async () => {
    harness.pending[index]?.();
    await Promise.resolve();
  });
}

describe("useLayoutedGraph — layout survives effect churn", () => {
  it("applies the layout under React StrictMode's double mount", async () => {
    loadFixture();
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );

    // The topology guard means the double mount dispatches exactly one layout.
    expect(harness.layout).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("count").textContent).toBe("0"); // still in flight

    await resolveLayout(0);

    // Before the fix this stayed "0": the StrictMode unmount cancelled the only
    // dispatch and the remount skipped re-dispatching (topology unchanged).
    expect(screen.getByTestId("count").textContent).toBe("2");
  });

  it("keeps a pending layout when a non-topology doc edit re-runs the effect", async () => {
    loadFixture();
    render(<Probe />);
    expect(harness.layout).toHaveBeenCalledTimes(1);

    // A rename changes the doc (re-running the effect) but not the topology, so
    // no new layout is dispatched. The original layout must still apply.
    act(() => {
      docStore.updateElementName("biz", "Billing v2");
    });
    expect(harness.layout).toHaveBeenCalledTimes(1);

    await resolveLayout(0);

    expect(screen.getByTestId("count").textContent).toBe("2");
  });

  it("ignores a superseded layout result that resolves after a newer one", async () => {
    loadFixture();
    render(<Probe />);
    expect(harness.layout).toHaveBeenCalledTimes(1); // business view: 2 nodes

    // Switch layer → topology changes → a second layout is dispatched (3 nodes).
    act(() => {
      useViewStore.getState().setLayer("engineering");
    });
    expect(harness.layout).toHaveBeenCalledTimes(2);

    // Resolve the newer (engineering) layout first, then the stale (business) one.
    await resolveLayout(1);
    expect(screen.getByTestId("count").textContent).toBe("3");

    await resolveLayout(0);

    // The stale result must NOT clobber the current one.
    expect(screen.getByTestId("count").textContent).toBe("3");
  });

  it("reports isLaying while a layout is in flight and clears it on resolve", async () => {
    loadFixture();
    render(<Probe />);

    // Dispatched but unresolved → laying out.
    expect(screen.getByTestId("laying").textContent).toBe("yes");

    await resolveLayout(0);

    expect(screen.getByTestId("laying").textContent).toBe("no");
  });

  it("re-applies a cached layout instantly when revisiting a layer (no re-run)", async () => {
    loadFixture();
    render(<Probe />);
    await resolveLayout(0); // business laid out + cached → 2 nodes
    expect(screen.getByTestId("count").textContent).toBe("2");

    // Switch to engineering: topology changes → a fresh layout is dispatched.
    act(() => {
      useViewStore.getState().setLayer("engineering");
    });
    expect(harness.layout).toHaveBeenCalledTimes(2);
    await resolveLayout(1); // engineering laid out + cached → 3 nodes
    expect(screen.getByTestId("count").textContent).toBe("3");

    // Back to business: this topology is cached, so it applies WITHOUT a third
    // ELK call and without a pending state — the win issue #25 is about.
    act(() => {
      useViewStore.getState().setLayer("business");
    });
    expect(harness.layout).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getByTestId("laying").textContent).toBe("no");
  });

  it("does not re-run ELK when only the MVP focus changes (scrub)", () => {
    loadFixture();
    render(<Probe />);
    expect(harness.layout).toHaveBeenCalledTimes(1);

    // Scrubbing the MVP timeline is pure view state — the layout is computed for
    // the maximal element set across all MVPs, so it must NOT trigger a re-run.
    act(() => {
      useViewStore.getState().setMvp("mvp1");
    });

    expect(harness.layout).toHaveBeenCalledTimes(1);
  });
});
