// ============================================================================
// savePicker — write the doc back to disk
// ============================================================================
// Three patterns supported, in priority order:
//
//   1. Save (if we have a file handle): write back to the exact file the user
//      opened. No prompt, no rename. The handle came from `openFilePicker`.
//      Requires Chromium-based browsers (File System Access API).
//
//   2. Save As: prompt for a new location. Future saves write back here.
//
//   3. Download (fallback): Safari/Firefox don't ship the API yet. We emit a
//      .yaml download with the project name. The user picks the directory in
//      their OS download dialog.
//
// All three serialize the document via the `yaml` package (so output is
// human-readable YAML, not JSON).
// ============================================================================

import { stringify as stringifyYaml } from "yaml";

import { docStore } from "@/core/doc/DocStore";

import type { ProjectDocument } from "@/core/schema/schema";

// File System Access API types vary by environment; declare narrowly here.
interface FileSystemWritableFileStream {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
  name: string;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: {
    description: string;
    accept: Record<string, string[]>;
  }[];
}

interface WindowWithFsAccess {
  showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}

// The handle to the file this project was opened from / last saved to.
// Module-level so Save (no prompt) works across the whole session.
let currentFileHandle: FileSystemFileHandle | null = null;

export function setCurrentFileHandle(handle: FileSystemFileHandle | null): void {
  currentFileHandle = handle;
}

export function hasCurrentFileHandle(): boolean {
  return currentFileHandle !== null;
}

/** Quick save — write to the current file handle, no prompt. */
export async function saveToCurrentFile(): Promise<SaveResult> {
  const doc = docStore.get();
  if (doc === null) return { ok: false, error: "no document loaded" };

  if (currentFileHandle === null) {
    // Falls through to Save As semantics so the user always gets a result.
    return saveAs();
  }

  try {
    await writeDocToHandle(currentFileHandle, doc);
    docStore.commit();
    return { ok: true, name: currentFileHandle.name };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Save As — prompt for a new location, then save there. */
export async function saveAs(): Promise<SaveResult> {
  const doc = docStore.get();
  if (doc === null) return { ok: false, error: "no document loaded" };

  const w = window as WindowWithFsAccess;
  const showSave = w.showSaveFilePicker;
  if (showSave === undefined) {
    // Browser without the API → fall back to download
    downloadDoc(doc);
    docStore.commit();
    return { ok: true, name: `${doc.project.id}.yaml`, viaDownload: true };
  }

  try {
    const handle = await showSave({
      suggestedName: `${doc.project.id}.yaml`,
      types: [
        {
          description: "YAML project file",
          accept: { "application/yaml": [".yaml", ".yml"] },
        },
      ],
    });
    await writeDocToHandle(handle, doc);
    currentFileHandle = handle;
    docStore.commit();
    return { ok: true, name: handle.name };
  } catch (err) {
    // User cancelled — distinguishable but we treat as a no-op
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "cancelled", cancelled: true };
    }
    return { ok: false, error: errorMessage(err) };
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function writeDocToHandle(
  handle: FileSystemFileHandle,
  doc: ProjectDocument,
): Promise<void> {
  const yaml = stringifyYaml(doc, { indent: 2, lineWidth: 100 });
  const writable = await handle.createWritable();
  try {
    await writable.write(yaml);
  } finally {
    await writable.close();
  }
}

function downloadDoc(doc: ProjectDocument): void {
  const yaml = stringifyYaml(doc, { indent: 2, lineWidth: 100 });
  const blob = new Blob([yaml], { type: "application/yaml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${doc.project.id}.yaml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ----------------------------------------------------------------------------
// Result types
// ----------------------------------------------------------------------------

export type SaveResult =
  | { ok: true; name: string; viaDownload?: boolean }
  | { ok: false; error: string; cancelled?: boolean };
