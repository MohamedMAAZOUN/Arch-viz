import { beforeEach, describe, expect, it } from "vitest";

import { notify, useNotificationStore } from "@/core/state/notificationStore";

describe("notificationStore", () => {
  beforeEach(() => {
    useNotificationStore.getState().clear();
  });

  it("starts empty", () => {
    expect(useNotificationStore.getState().notifications).toEqual([]);
  });

  it("appends a notification and assigns an id", () => {
    const id = notify({ level: "error", title: "Failed to load file", detail: "bad yaml" });
    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      id,
      level: "error",
      title: "Failed to load file",
      detail: "bad yaml",
    });
    expect(id).not.toBe("");
  });

  it("keeps multiple notifications stacked in order", () => {
    notify({ level: "info", title: "first" });
    notify({ level: "success", title: "second" });
    const titles = useNotificationStore.getState().notifications.map((n) => n.title);
    expect(titles).toEqual(["first", "second"]);
  });

  it("dismisses only the matching notification", () => {
    const a = notify({ level: "error", title: "a" });
    notify({ level: "error", title: "b" });
    useNotificationStore.getState().dismiss(a);
    const titles = useNotificationStore.getState().notifications.map((n) => n.title);
    expect(titles).toEqual(["b"]);
  });

  it("clears everything", () => {
    notify({ level: "error", title: "a" });
    notify({ level: "error", title: "b" });
    useNotificationStore.getState().clear();
    expect(useNotificationStore.getState().notifications).toEqual([]);
  });
});
