// ============================================================================
// FileLoader — drag-and-drop zone for loading project YAML
// ============================================================================
// Wraps the app shell. Listens for `dragover` and `drop` at the window level
// so the user can drop a .yaml file anywhere in the app, not just on a
// specific target. Visual feedback (an overlay) appears while a file is
// being dragged over the window.
//
// For programmatic open (a button click), use openFilePicker from the
// sibling module — kept separate so this file exports only React components.
//
// Files go through the same trust boundary as everything else: read text →
// parse via Zod → loadProject. Failures show as toast-style errors below
// the dropzone overlay.
// ============================================================================

import { useEffect, useRef, useState } from "react";

import { loadProject } from "@/core/doc/loadProject";
import { parseProjectYaml } from "@/core/schema/parse";

import "@/features/file-loader/FileLoader.css";

async function loadFile(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const text = await file.text();
    const result = parseProjectYaml(text);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    loadProject(result.value);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface FileLoaderProps {
  children: React.ReactNode;
}

export default function FileLoader({ children }: FileLoaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Counter required to handle nested dragenter/leave correctly.
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setDragActive(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer !== null) e.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragActive(false);
    };

    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragActive(false);

      const file = e.dataTransfer?.files[0];
      if (file === undefined) return;

      void loadFile(file).then((result) => {
        if (!result.ok) setError(result.error);
        else setError(null);
      });
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <>
      {children}
      {dragActive ? (
        <div className="file-loader-overlay" aria-hidden>
          <div className="file-loader-card">
            <FileIcon />
            <div className="file-loader-title">Drop a project file</div>
            <div className="file-loader-text">.yaml or .yml</div>
          </div>
        </div>
      ) : null}
      {error !== null ? (
        <div className="file-loader-error" role="alert">
          <div className="file-loader-error-title">Failed to load file</div>
          <pre className="file-loader-error-detail">{error}</pre>
          <button
            type="button"
            className="file-loader-error-dismiss"
            onClick={() => {
              setError(null);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </>
  );
}

function hasFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (types === undefined) return false;
  for (const t of types) {
    if (t === "Files") return true;
  }
  return false;
}

function FileIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <polyline points="9 15 12 12 15 15" />
    </svg>
  );
}
