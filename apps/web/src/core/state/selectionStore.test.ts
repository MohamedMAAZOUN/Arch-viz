// ============================================================================
// selectionStore.test.ts — single + multi selection semantics
// ============================================================================

import { afterEach, describe, expect, it } from "vitest";

import { useSelectionStore } from "@/core/state/selectionStore";

afterEach(() => {
  useSelectionStore.getState().clear();
});

describe("selectionStore", () => {
  it("starts empty", () => {
    const s = useSelectionStore.getState();
    expect(s.selectedIds).toEqual([]);
    expect(s.selectedId).toBeNull();
  });

  it("select replaces the whole selection and sets the primary", () => {
    useSelectionStore.getState().select("a");
    expect(useSelectionStore.getState().selectedIds).toEqual(["a"]);
    expect(useSelectionStore.getState().selectedId).toBe("a");

    useSelectionStore.getState().select("b");
    expect(useSelectionStore.getState().selectedIds).toEqual(["b"]);
    expect(useSelectionStore.getState().selectedId).toBe("b");
  });

  it("select(null) clears the selection", () => {
    useSelectionStore.getState().select("a");
    useSelectionStore.getState().select(null);
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
    expect(useSelectionStore.getState().selectedId).toBeNull();
  });

  it("toggle adds when absent and removes when present; primary is the last added", () => {
    const { toggle } = useSelectionStore.getState();
    toggle("a");
    toggle("b");
    expect(useSelectionStore.getState().selectedIds).toEqual(["a", "b"]);
    expect(useSelectionStore.getState().selectedId).toBe("b");

    toggle("b"); // remove the primary → primary falls back to the previous
    expect(useSelectionStore.getState().selectedIds).toEqual(["a"]);
    expect(useSelectionStore.getState().selectedId).toBe("a");

    toggle("a"); // remove the last → empty
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
    expect(useSelectionStore.getState().selectedId).toBeNull();
  });

  it("setMany replaces the set and makes the last entry primary", () => {
    useSelectionStore.getState().setMany(["x", "y", "z"]);
    expect(useSelectionStore.getState().selectedIds).toEqual(["x", "y", "z"]);
    expect(useSelectionStore.getState().selectedId).toBe("z");

    useSelectionStore.getState().setMany([]);
    expect(useSelectionStore.getState().selectedId).toBeNull();
  });
});
