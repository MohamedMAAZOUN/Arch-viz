// ============================================================================
// tourStore.test.ts — playback position state machine
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";

import { useTourStore } from "@/core/state/tourStore";

const get = () => useTourStore.getState();

beforeEach(() => {
  get().exit();
});

describe("tourStore", () => {
  it("starts a tour at step 0 and playing", () => {
    get().start("exec-overview", 3);
    expect(get().activeTourId).toBe("exec-overview");
    expect(get().stepIndex).toBe(0);
    expect(get().stepCount).toBe(3);
    expect(get().isPlaying).toBe(true);
  });

  it("advances with next and steps back with prev", () => {
    get().start("t", 3);
    get().next();
    expect(get().stepIndex).toBe(1);
    get().next();
    expect(get().stepIndex).toBe(2);
    get().prev();
    expect(get().stepIndex).toBe(1);
  });

  it("stops playing (without looping) on the last step", () => {
    get().start("t", 2);
    get().next(); // → 1 (last)
    expect(get().stepIndex).toBe(1);
    get().next(); // already last
    expect(get().stepIndex).toBe(1);
    expect(get().isPlaying).toBe(false);
  });

  it("clamps prev at the first step", () => {
    get().start("t", 3);
    get().prev();
    expect(get().stepIndex).toBe(0);
  });

  it("clamps goTo to range", () => {
    get().start("t", 3);
    get().goTo(99);
    expect(get().stepIndex).toBe(2);
    get().goTo(-5);
    expect(get().stepIndex).toBe(0);
  });

  it("toggles play/pause and exits cleanly", () => {
    get().start("t", 3);
    get().togglePlay();
    expect(get().isPlaying).toBe(false);
    get().togglePlay();
    expect(get().isPlaying).toBe(true);

    get().exit();
    expect(get().activeTourId).toBeNull();
    expect(get().stepIndex).toBe(0);
    expect(get().isPlaying).toBe(false);
  });

  it("next does nothing when no tour is active", () => {
    get().next();
    expect(get().activeTourId).toBeNull();
    expect(get().stepIndex).toBe(0);
  });
});
