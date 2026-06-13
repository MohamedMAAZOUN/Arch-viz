import { beforeEach, describe, expect, it } from "vitest";

import { useUiStore } from "@/core/state/uiStore";

// The store persists pinned state; reset to a known baseline before each test
// so order doesn't matter and we're asserting behaviour, not leftover state.
function reset() {
  useUiStore.setState({
    panels: {
      top: { pinned: true, open: true },
      left: { pinned: false, open: false },
      right: { pinned: false, open: false },
    },
  });
}

describe("uiStore panels", () => {
  beforeEach(reset);

  it("openPanel / closePanel toggle only the open flag, never pinned", () => {
    useUiStore.getState().openPanel("left");
    expect(useUiStore.getState().panels.left).toEqual({ pinned: false, open: true });

    useUiStore.getState().closePanel("left");
    expect(useUiStore.getState().panels.left).toEqual({ pinned: false, open: false });
  });

  it("pinning forces the panel open", () => {
    useUiStore.getState().togglePanelPinned("right");
    expect(useUiStore.getState().panels.right).toEqual({ pinned: true, open: true });
  });

  it("unpinning leaves the panel open until it's dismissed", () => {
    useUiStore.getState().togglePanelPinned("right"); // pin → open
    useUiStore.getState().togglePanelPinned("right"); // unpin
    expect(useUiStore.getState().panels.right).toEqual({ pinned: false, open: true });
  });

  it("acting on one panel does not affect the others", () => {
    useUiStore.getState().openPanel("left");
    const { panels } = useUiStore.getState();
    expect(panels.top).toEqual({ pinned: true, open: true });
    expect(panels.right).toEqual({ pinned: false, open: false });
  });
});
