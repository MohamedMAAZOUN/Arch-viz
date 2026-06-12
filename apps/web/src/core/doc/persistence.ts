// ============================================================================
// Persistence — draft survival via IndexedDB
// ============================================================================
// The ONLY file allowed to import y-indexeddb. v1 scope: wire the y-indexeddb
// provider to the singleton Y.Doc so draft edits survive a reload.
//
// File-system save/load (Pattern 1 from the "deployment" discussion) lives
// here too — once we wire it in.
// ============================================================================

import { IndexeddbPersistence } from "y-indexeddb";

import { docStore } from "@/core/doc/DocStore";

const DRAFT_DB_NAME = "arch-vis-draft";

let provider: IndexeddbPersistence | null = null;

/** Initialize draft persistence. Call ONCE at app startup. */
export async function initDraftPersistence(): Promise<void> {
  if (provider !== null) return;
  provider = new IndexeddbPersistence(DRAFT_DB_NAME, docStore.__internal.yDoc);
  await provider.whenSynced;
}

/** Wipe the persisted draft. Use only when discarding everything. */
export async function clearDraftPersistence(): Promise<void> {
  if (provider === null) return;
  await provider.clearData();
}
