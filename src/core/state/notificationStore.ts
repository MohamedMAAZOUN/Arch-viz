// ============================================================================
// notificationStore — the app's single error/notification sink
// ============================================================================
// One place to publish a user-facing message from anywhere (event handlers,
// async callbacks, modules with no React context), and one host component
// (`NotificationHost`) that subscribes and renders the toasts.
//
// Why a store and not local component state: several independent paths need to
// surface the same kind of message — the drag-drop loader, the programmatic
// file picker, and the save flow. Wiring each to its own toast meant some
// paths (notably the programmatic picker) had no visible surface at all and
// fell back to `console.error`. Publishing to a shared sink fixes that and
// keeps a single, consistent toast UI.
//
// Notifications are ephemeral session state — never persisted.
// ============================================================================

import { create } from "zustand";

import { createId } from "@/lib/id";

export type NotificationLevel = "error" | "success" | "info";

export interface Notification {
  id: string;
  level: NotificationLevel;
  /** Short headline, e.g. "Failed to load file". */
  title: string;
  /** Optional longer body — parser output, an error message, etc. */
  detail?: string;
}

/** What callers pass to {@link NotificationState.notify} (id is assigned for them). */
export type NotificationInput = Omit<Notification, "id">;

interface NotificationState {
  notifications: Notification[];
  /** Publish a notification. Returns its generated id (so callers can dismiss). */
  notify: (input: NotificationInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  notify: (input) => {
    const id = createId("toast");
    set((s) => ({ notifications: [...s.notifications, { ...input, id }] }));
    return id;
  },

  dismiss: (id) => {
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
  },

  clear: () => {
    set({ notifications: [] });
  },
}));

/**
 * Imperative publish for non-React callers (modules, event handlers). Mirrors
 * the store action so a file like `openFilePicker` doesn't need a hook.
 */
export function notify(input: NotificationInput): string {
  return useNotificationStore.getState().notify(input);
}
