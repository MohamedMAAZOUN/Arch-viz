import { describe, expect, it } from "vitest";

import {
  selectRemoteColorIndex,
  usePresenceStore,
  type RemoteParticipant,
} from "@/core/state/presenceStore";

const ada: RemoteParticipant = {
  clientId: 1,
  name: "Ada",
  role: "editor",
  colorIndex: 3,
  selection: ["svc-a"],
};
const max: RemoteParticipant = {
  clientId: 2,
  name: "Max",
  role: "viewer",
  colorIndex: 5,
  selection: ["svc-b", "svc-c"],
};

describe("presenceStore", () => {
  it("returns the color index of a remote participant selecting the element", () => {
    usePresenceStore.getState().setParticipants([ada, max]);
    expect(selectRemoteColorIndex("svc-a")(usePresenceStore.getState())).toBe(3);
    expect(selectRemoteColorIndex("svc-c")(usePresenceStore.getState())).toBe(5);
  });

  it("returns null when no remote participant has the element selected", () => {
    usePresenceStore.getState().setParticipants([ada, max]);
    expect(selectRemoteColorIndex("nope")(usePresenceStore.getState())).toBeNull();
  });

  it("resets participants and connection state", () => {
    usePresenceStore.getState().setParticipants([ada]);
    usePresenceStore.getState().setConnected(true);
    usePresenceStore.getState().reset();
    expect(usePresenceStore.getState().participants).toEqual([]);
    expect(usePresenceStore.getState().connected).toBe(false);
  });
});
