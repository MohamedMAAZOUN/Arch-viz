// ============================================================================
// virtualWindow.test — windowing math for the virtualized inspector list
// ============================================================================

import { describe, expect, it } from "vitest";

import { visibleRange } from "@/lib/virtualWindow";

describe("visibleRange", () => {
  it("returns an empty range for no items", () => {
    expect(visibleRange(0, 300, 40, 0, 6)).toEqual({ start: 0, end: 0 });
  });

  it("windows to the viewport plus overscan at the top", () => {
    // 300px viewport / 40px rows = 8 visible rows; +6 overscan each side.
    expect(visibleRange(0, 300, 40, 1000, 6)).toEqual({ start: 0, end: 14 });
  });

  it("offsets the window as it scrolls and clamps to the count", () => {
    // scrollTop 4000 → first row 100; window 100-6 .. 100+8+6.
    expect(visibleRange(4000, 300, 40, 1000, 6)).toEqual({ start: 94, end: 114 });
    // Near the end it clamps to the item count.
    expect(visibleRange(39_600, 300, 40, 1000, 6)).toEqual({ start: 984, end: 1000 });
  });

  it("guards against a zero row height", () => {
    expect(visibleRange(0, 300, 0, 1000, 6)).toEqual({ start: 0, end: 0 });
  });
});
