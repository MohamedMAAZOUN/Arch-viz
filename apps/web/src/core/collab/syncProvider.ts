// ============================================================================
// syncProvider — the multiplayer wrapper (ADR 0014, #65)
// ============================================================================
// The ONLY file allowed to import @hocuspocus/provider (repo rule, ESLint-
// enforced). It attaches a provider to the EXISTING singleton Y.Doc — DocStore's
// API surface is unchanged, and y-indexeddb stays wired as the offline cache, so
// offline edits merge on reconnect (CRDT, no merge code). Awareness is published
// to the presence store (view-state); it is never persisted.
//
// The handshake: the provider fetches a short-lived signed JWT from
// GET /auth/ws-token for each connect; Hocuspocus verifies it and runs the role
// check (viewers get a server-enforced read-only connection).
// ============================================================================

import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";

import { authApi } from "@/core/api/auth";
import { docStore } from "@/core/doc/DocStore";
import {
  usePresenceStore,
  type CollabRole,
  type RemoteParticipant,
} from "@/core/state/presenceStore";

export interface LocalParticipant {
  readonly name: string;
  readonly role: CollabRole;
}

let provider: HocuspocusProvider | null = null;

/** Derive the ws(s):// sync endpoint from the configured API base (or origin). */
function syncUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (base !== undefined && base.length > 0) return `${base.replace(/^http/, "ws")}/sync`;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/sync`;
}

/** Stable 1..8 color index for a participant, from their Yjs client id. */
function colorIndexFor(clientId: number): number {
  return (Math.abs(clientId) % 8) + 1;
}

function isRole(value: unknown): value is CollabRole {
  return value === "owner" || value === "editor" || value === "viewer";
}

/** Read awareness states → presence store (excluding ourselves). */
function publishPresence(): void {
  const awareness = provider?.awareness;
  if (!awareness) {
    usePresenceStore.getState().setParticipants([]);
    return;
  }
  const localId = awareness.clientID;
  const out: RemoteParticipant[] = [];
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === localId) continue;
    const record = state as { user?: { name?: unknown; role?: unknown }; selection?: unknown };
    const selection = Array.isArray(record.selection)
      ? record.selection.filter((x): x is string => typeof x === "string")
      : [];
    out.push({
      clientId,
      name: typeof record.user?.name === "string" ? record.user.name : "Someone",
      role: isRole(record.user?.role) ? record.user.role : "viewer",
      colorIndex: colorIndexFor(clientId),
      selection,
    });
  }
  usePresenceStore.getState().setParticipants(out);
}

/** Attach the provider to the shared Y.Doc for `projectId`'s room. */
export function connectSync(projectId: string, local: LocalParticipant): void {
  if (provider?.configuration.name === projectId) return;
  disconnectSync();

  provider = new HocuspocusProvider({
    url: syncUrl(),
    name: projectId,
    document: docStore.__internal.yDoc,
    token: async () => {
      const result = await authApi.getWsToken();
      return result.ok ? result.value.token : "";
    },
    onAwarenessChange: () => {
      publishPresence();
    },
    onStatus: ({ status }) => {
      usePresenceStore.getState().setConnected(status === WebSocketStatus.Connected);
    },
    onAuthenticationFailed: () => {
      usePresenceStore.getState().setConnected(false);
    },
  });

  provider.awareness?.setLocalStateField("user", { name: local.name, role: local.role });
  publishPresence();
}

/** Publish the local user's current selection to the room (awareness only). */
export function setLocalSelection(ids: readonly string[]): void {
  provider?.awareness?.setLocalStateField("selection", [...ids]);
}

/** Detach the provider. The shared Y.Doc and the IndexedDB cache are untouched. */
export function disconnectSync(): void {
  if (provider === null) return;
  provider.destroy();
  provider = null;
  usePresenceStore.getState().reset();
}
