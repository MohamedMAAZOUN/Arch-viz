// ============================================================================
// openFilePicker — programmatic trigger of the OS file dialog
// ============================================================================
// Two-path strategy:
//
//   1. Modern (Chromium): showOpenFilePicker → File System Access API.
//      We capture the FileSystemFileHandle into savePicker's module state
//      so subsequent Cmd/Ctrl+S writes back to the SAME file.
//
//   2. Fallback (Safari, Firefox): hidden <input type="file">. Loads work,
//      but the browser doesn't expose a handle — subsequent saves prompt
//      via Save As / download.
//
// Both paths route through the same parseProjectYaml → loadProject pipeline.
// ============================================================================

import { loadProject } from "@/core/doc/loadProject";
import { parseProjectYaml } from "@/core/schema/parse";
import { notify } from "@/core/state/notificationStore";
import { setCurrentFileHandle } from "@/features/file-loader/savePicker";

const ACCEPT = ".yaml,.yml,application/yaml,text/yaml";

// Narrow type for the File System Access API.
interface FileSystemWritableFileStream {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
  getFile(): Promise<File>;
  name: string;
}

interface OpenFilePickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[];
  multiple?: boolean;
}

interface WindowWithFsAccess {
  showOpenFilePicker?: (opts?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
}

export function openFilePicker(): void {
  const w = window as WindowWithFsAccess;
  const showOpen = w.showOpenFilePicker;

  if (showOpen !== undefined) {
    void openViaFsApi(showOpen);
  } else {
    openViaInputElement();
  }
}

async function openViaFsApi(
  showOpen: NonNullable<WindowWithFsAccess["showOpenFilePicker"]>,
): Promise<void> {
  try {
    const [handle] = await showOpen({
      multiple: false,
      types: [
        {
          description: "YAML project file",
          accept: { "application/yaml": [".yaml", ".yml"] },
        },
      ],
    });
    if (handle === undefined) return;

    const file = await handle.getFile();
    const text = await file.text();
    const result = parseProjectYaml(text);
    if (!result.ok) {
      notify({ level: "error", title: "Failed to load file", detail: result.error });
      return;
    }

    setCurrentFileHandle(handle);
    loadProject(result.value);
  } catch (err) {
    // User cancelled via AbortError — silent. Other errors surface as a toast.
    if (err instanceof DOMException && err.name === "AbortError") return;
    notify({ level: "error", title: "Failed to open file", detail: errorMessage(err) });
  }
}

function openViaInputElement(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ACCEPT;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file === undefined) return;
    void loadFileAndApply(file);
  });
  input.click();
}

async function loadFileAndApply(file: File): Promise<void> {
  try {
    const text = await file.text();
    const result = parseProjectYaml(text);
    if (!result.ok) {
      notify({ level: "error", title: "Failed to load file", detail: result.error });
      return;
    }
    // No handle available in the input-element path; clear any stale handle.
    setCurrentFileHandle(null);
    loadProject(result.value);
  } catch (err) {
    notify({ level: "error", title: "Failed to read file", detail: errorMessage(err) });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
