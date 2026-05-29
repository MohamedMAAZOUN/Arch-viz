// ============================================================================
// TopBar — the persistent header
// ============================================================================
// Three columns:
//   Left   — tool brand + (when a project is loaded) project name pill
//   Center — layer toggle + MVP slider (visible only when a project is loaded)
//   Right  — settings menu trigger
// ============================================================================

import { useEffect, useState } from "react";

import { docStore } from "@/core/doc/DocStore";
import { useDirty } from "@/core/doc/useDirty";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useUndoRedoState } from "@/core/doc/useUndoRedoState";
import { useUiStore } from "@/core/state/uiStore";
import { openFilePicker } from "@/features/file-loader/openFilePicker";
import { saveToCurrentFile } from "@/features/file-loader/savePicker";
import LayerToggle from "@/features/layer-toggle/LayerToggle";
import ReorganizeButton from "@/features/layer-toggle/ReorganizeButton";
import MvpSlider from "@/features/mvp-slider/MvpSlider";
import SettingsMenu from "@/features/settings/SettingsMenu";

import "@/features/topbar/TopBar.css";

export default function TopBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const doc = useDocSnapshot();
  const inspectorOpen = useUiStore((s) => s.inspectorOpen);
  const toggleInspector = useUiStore((s) => s.toggleInspector);
  const { canUndo, canRedo } = useUndoRedoState();
  const dirty = useDirty();

  const handleSave = () => {
    if (doc === null || saving) return;
    setSaving(true);
    setSaveError(null);
    void saveToCurrentFile()
      .then((result) => {
        if (!result.ok && !result.cancelled) {
          setSaveError(result.error);
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
          {doc !== null ? (
            <div className="topbar-project">
              <span className="topbar-project-dot" />
              <span className="topbar-project-name">{doc.project.name}</span>
            </div>
          ) : null}
          <LayerToggle />
          <ReorganizeButton />
          <MvpSlider />
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
            onClick={toggleInspector}
            aria-label={inspectorOpen ? "Hide sidebar" : "Show sidebar"}
            title={inspectorOpen ? "Hide sidebar" : "Show sidebar"}
            data-active={!inspectorOpen}
          >
            <SidebarIcon open={inspectorOpen} />
            <span>{inspectorOpen ? "hide sidebar" : "show sidebar"}</span>
          </button>
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

      {saveError !== null ? (
        <div className="topbar-save-error" role="alert">
          <div className="topbar-save-error-title">Save failed</div>
          <div className="topbar-save-error-text">{saveError}</div>
          <button
            type="button"
            className="topbar-save-error-dismiss"
            onClick={() => {
              setSaveError(null);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {settingsOpen ? (
        <SettingsMenu
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      ) : null}
    </>
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

function SidebarIcon({ open }: { open: boolean }) {
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
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <line x1="15" y1="5" x2="15" y2="19" />
      {open ? (
        <line x1="18.5" y1="9" x2="18.5" y2="15" />
      ) : (
        <line x1="18" y1="10" x2="18" y2="14" strokeOpacity="0.4" />
      )}
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
