// ============================================================================
// presenceStore — multiplayer awareness, in the view-state tier (#66)
// ============================================================================
// Awareness (who's connected, what they have selected) is ephemeral per-session
// UI state — it belongs in Zustand, NOT in the Y.Doc and never in Postgres
// (state-tiers rule, ADR 0010 + ADR 0014). The sync wrapper publishes the
// remote participants here; the topbar avatars and the canvas selection
// highlight read from it.
// ============================================================================

import { create } from "zustand";

export type CollabRole = "owner" | "editor" | "viewer";

export interface RemoteParticipant {
  readonly clientId: number;
  readonly name: string;
  readonly role: CollabRole;
  /** 1..8 — index into the presence color tokens (no raw color in JS). */
  readonly colorIndex: number;
  readonly selection: readonly string[];
}

export interface PresenceState {
  participants: readonly RemoteParticipant[];
  connected: boolean;
  setParticipants: (participants: readonly RemoteParticipant[]) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  participants: [],
  connected: false,
  setParticipants: (participants) => {
    set({ participants });
  },
  setConnected: (connected) => {
    set({ connected });
  },
  reset: () => {
    set({ participants: [], connected: false });
  },
}));

/**
 * Selector: the presence color index of the first remote participant who has
 * this element selected, or null. A primitive return means a node re-renders
 * only when its own remote-selection color changes.
 */
export function selectRemoteColorIndex(elementId: string) {
  return (s: PresenceState): number | null => {
    for (const p of s.participants) {
      if (p.selection.includes(elementId)) return p.colorIndex;
    }
    return null;
  };
}
