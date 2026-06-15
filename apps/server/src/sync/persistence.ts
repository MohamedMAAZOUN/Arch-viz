// ============================================================================
// Yjs document persistence — the load/store/compaction core (#65)
// ============================================================================
// Extracted from the Hocuspocus hooks so the behaviour is unit-testable with a
// real Y.Doc and the in-memory repository (no socket, no Postgres):
//
//   • loadDocument  — replay the append-only update log into the Y.Doc.
//   • storeDocument — append the delta since the last persist, then compact the
//     log into a single full-state row once it exceeds the threshold.
//
// `persistedStateVectors` is the per-document memory of "what we last wrote", so
// each store records a delta rather than the whole document.
// ============================================================================

import * as Y from "yjs";

import type { Repository } from "../db/repository";

/** Compact once the per-project log grows past this many rows. */
export const COMPACTION_THRESHOLD = 50;

/** Replay the persisted log into `document` and seed its persisted state vector. */
export async function loadDocument(
  repo: Repository,
  documentName: string,
  document: Y.Doc,
  persistedStateVectors: Map<string, Uint8Array>,
): Promise<void> {
  const updates = await repo.yjsUpdates.listForProject(documentName);
  for (const update of updates) Y.applyUpdate(document, update);
  persistedStateVectors.set(documentName, Y.encodeStateVector(document));
}

/** Append the delta since the last persist; compact when the log grows large. */
export async function storeDocument(
  repo: Repository,
  documentName: string,
  document: Y.Doc,
  persistedStateVectors: Map<string, Uint8Array>,
  threshold: number = COMPACTION_THRESHOLD,
): Promise<void> {
  const since = persistedStateVectors.get(documentName);
  const delta = since ? Y.encodeStateAsUpdate(document, since) : Y.encodeStateAsUpdate(document);
  await repo.yjsUpdates.append(documentName, delta);
  persistedStateVectors.set(documentName, Y.encodeStateVector(document));

  if ((await repo.yjsUpdates.count(documentName)) > threshold) {
    await repo.yjsUpdates.compact(documentName, Y.encodeStateAsUpdate(document));
  }
}
