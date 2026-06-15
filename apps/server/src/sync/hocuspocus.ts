// ============================================================================
// Hocuspocus sync server (ADR 0014, #65)
// ============================================================================
// One room per project document. The data layer is already multiplayer-ready
// (Yjs is the document store), so this only adds the sync hooks:
//
//   • onAuthenticate — verify the short-lived ws-token JWT (identity is already
//     internal), run the #61 role check, and force read-only for viewers.
//   • onLoadDocument — replay the `yjs_updates` log into the Y.Doc.
//   • onStoreDocument — debounced; append the delta since the last persist,
//     then compact the log into a single full-state row once it grows past a
//     threshold so the table stays bounded under sustained editing.
//
// The load/store/compaction core (and the Yjs encode/apply calls) lives in
// ./persistence so it is unit-testable without a socket; this module is the
// thin Hocuspocus binding around it.
// ============================================================================

import { Hocuspocus } from "@hocuspocus/server";

import { loadDocument, storeDocument } from "./persistence";
import { resolveSyncAccess } from "./roles";
import { verifyWsToken } from "../auth/wsToken";

import type { Clock } from "../auth/clock";
import type { AppConfig } from "../config";
import type { Repository } from "../db/repository";

export interface SyncDeps {
  readonly repo: Repository;
  readonly config: AppConfig;
  readonly clock: Clock;
}

export function createSyncServer(deps: SyncDeps): Hocuspocus {
  // The state vector last persisted for each loaded document, so onStoreDocument
  // writes a delta rather than the whole document each debounce.
  const persistedStateVectors = new Map<string, Uint8Array>();

  return new Hocuspocus({
    name: "arch-vis-sync",
    quiet: true,
    // Persist at most every 2s of activity, but at least every 10s.
    debounce: 2000,
    maxDebounce: 10_000,

    onAuthenticate: async ({ token, documentName, connection }) => {
      const claims = verifyWsToken(token, deps.config.session.cookieSecret, deps.clock().getTime());
      if (!claims.ok) throw new Error("Unauthorized");

      const access = await resolveSyncAccess(deps.repo, claims.value.userId, documentName);
      if (!access) throw new Error("Forbidden");

      // Viewer = read-only at the protocol level (server-enforced, not UI-only).
      if (!access.canEdit) connection.readOnly = true;

      return { userId: claims.value.userId, role: access.role };
    },

    onLoadDocument: async ({ documentName, document }) => {
      await loadDocument(deps.repo, documentName, document, persistedStateVectors);
      return document;
    },

    onStoreDocument: async ({ documentName, document }) => {
      await storeDocument(deps.repo, documentName, document, persistedStateVectors);
    },

    afterUnloadDocument: ({ documentName }) => {
      persistedStateVectors.delete(documentName);
      return Promise.resolve();
    },
  });
}
