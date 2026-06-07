// ============================================================================
// TopBar — the persistent header (app chrome)
// ============================================================================
//   Left   — tool brand
//   Center — project name pill (when a project is loaded)
//   Right  — file actions (open / save), undo-redo, settings
//
// View controls (layer / MVP / reorganize) live in the floating top panel, not
// here — they're view state, so they belong with the canvas.
// ============================================================================

import { useEffect, useState } from "react";

import { docStore } from "@/core/doc/DocStore";
import { useDirty } from "@/core/doc/useDirty";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useUndoRedoState } from "@/core/doc/useUndoRedoState";
import { notify } from "@/core/state/notificationStore";
import ArchitecturePicker from "@/features/architecture-picker/ArchitecturePicker";
import { openFilePicker } from "@/features/file-loader/openFilePicker";
import { saveToCurrentFile } from "@/features/file-loader/savePicker";
import SettingsMenu from "@/features/settings/SettingsMenu";

import "@/features/topbar/TopBar.css";

export default function TopBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const doc = useDocSnapshot();
  const { canUndo, canRedo } = useUndoRedoState();
  const dirty = useDirty();

  const handleSave = () => {
    if (doc === null || saving) return;
    setSaving(true);
    void saveToCurrentFile()
      .then((result) => {
        if (!result.ok && !result.cancelled) {
          notify({ level: "error", title: "Save failed", detail: result.error });
        }
      })
      .finally(() => {
        setSaving(false);
      });
  };

  // Ctrl/Cmd+S keyboard shortcut. Skip when typing in inputs/textareas.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.metaKey !== e.ctrlKey;
      if (!isModifier || e.key.toLowerCase() !== "s") return;
      if (isEditingTextField(e.target)) return;
      e.preventDefault();
      handleSave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
    // handleSave closes over latest doc/saving via React closures; that's fine
    // because we only fire on key press, not on render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, saving]);

  // Ctrl/Cmd+K opens the architecture switcher (command-palette style).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.metaKey !== e.ctrlKey;
      if (!isModifier || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      setPickerOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-eyebrow">tool</span>
          <h1 className="topbar-title">
            Architecture <span className="brand-word">Visualizer</span>
          </h1>
        </div>

        <div className="topbar-center">
          <button
            type="button"
            className="topbar-project topbar-project-btn"
            onClick={() => {
              setPickerOpen(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            title="Switch architecture (Ctrl/Cmd+K)"
          >
            {doc !== null ? (
              <>
                <span className="topbar-project-dot" />
                <span className="topbar-project-name">{doc.project.name}</span>
              </>
            ) : (
              <span className="topbar-project-name">Open architecture</span>
            )}
            <ChevronIcon />
          </button>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-action-btn"
            onClick={openFilePicker}
            aria-label="Open project file"
            title="Open .yaml file (or drag-drop)"
          >
            <FileIcon />
            <span>open</span>
          </button>
          <button
            type="button"
            className="topbar-action-btn"
            data-active={dirty}
            onClick={handleSave}
            disabled={doc === null || saving}
            aria-label="Save"
            title={dirty ? "Save changes (Ctrl/Cmd+S)" : "Nothing to save"}
          >
            <SaveIcon />
            <span>
              {saving ? "saving…" : dirty ? "save" : "saved"}
              {dirty ? <span className="topbar-dirty-dot" aria-hidden /> : null}
            </span>
          </button>
          <div className="topbar-undo-group">
            <button
              type="button"
              className="topbar-icon-btn"
              onClick={() => {
                docStore.undo();
              }}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo (Ctrl/Cmd+Z)"
            >
              <UndoIcon />
            </button>
            <button
              type="button"
              className="topbar-icon-btn"
              onClick={() => {
                docStore.redo();
              }}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo (Ctrl/Cmd+Shift+Z)"
            >
              <RedoIcon />
            </button>
          </div>
          <button
            type="button"
            className="topbar-action-btn"
            onClick={() => {
              setSettingsOpen(true);
            }}
            aria-label="Open settings"
          >
            <SettingsIcon />
            <span>settings</span>
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <SettingsMenu
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      ) : null}

      {pickerOpen ? (
        <ArchitecturePicker
          onClose={() => {
            setPickerOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="topbar-project-chevron"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h12a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H8a5 5 0 0 0 0 10h3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function isEditingTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
