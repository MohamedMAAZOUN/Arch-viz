// ============================================================================
// collabController — connect/disconnect the sync session as context changes
// ============================================================================
// Wires the stores to the provider wrapper without any React: connect a room
// when an authenticated user has a server project open, disconnect otherwise,
// and mirror the local selection into awareness. Initialized once at boot.
// ============================================================================

import { connectSync, disconnectSync, setLocalSelection } from "@/core/collab/syncProvider";
import { useProjectContextStore } from "@/core/state/projectContextStore";
import { useSelectionStore } from "@/core/state/selectionStore";
import { useSessionStore } from "@/core/state/sessionStore";

let initialized = false;
let currentRoom: string | null = null;

/** Decide whether a room should be connected and reconcile to that state. */
function reconcile(): void {
  const server = useProjectContextStore.getState().server;
  const user = useSessionStore.getState().user;
  // Multiplayer needs an internal identity (the ws-token is session-guarded).
  const wantedRoom = server !== null && user !== null ? server.id : null;

  if (wantedRoom === currentRoom) return;
  currentRoom = wantedRoom;

  if (wantedRoom !== null && server !== null && user !== null) {
    connectSync(wantedRoom, { name: user.displayName, role: server.role });
    setLocalSelection(useSelectionStore.getState().selectedIds);
  } else {
    disconnectSync();
  }
}

export function initCollab(): void {
  if (initialized) return;
  initialized = true;

  useProjectContextStore.subscribe(reconcile);
  useSessionStore.subscribe(reconcile);
  useSelectionStore.subscribe((state) => {
    setLocalSelection(state.selectedIds);
  });

  reconcile();
}
