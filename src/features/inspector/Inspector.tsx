// ============================================================================
// Inspector — the right-side panel
// ============================================================================
// Global mode (no selection): project-wide sections.
// Element mode: per-element sections.
//
// Includes:
//   - Resize handle on the left edge (drag to resize, double-click to reset)
//   - Close button in the header (hides the inspector; show button lives in TopBar)
// ============================================================================

import { useSelectionStore } from "@/core/state/selectionStore";
import { useUiStore } from "@/core/state/uiStore";
import InspectorResizer from "@/features/inspector/InspectorResizer";
import ElementSections from "@/features/inspector/sections/ElementSections";
import GlobalSections from "@/features/inspector/sections/GlobalSections";

import "@/features/inspector/Inspector.css";

export default function Inspector() {
  const selectedId = useSelectionStore((s) => s.selectedId);
  const setInspectorOpen = useUiStore((s) => s.setInspectorOpen);

  return (
    <>
      <InspectorResizer />
      <div className="inspector">
        <header className="inspector-header">
          <div className="inspector-header-text">
            <span className="inspector-eyebrow">
              {selectedId === null ? "project" : "element"}
            </span>
            <h2 className="inspector-title">{selectedId ?? "Inspector"}</h2>
          </div>
          <button
            type="button"
            className="inspector-close"
            aria-label="Hide sidebar"
            title="Hide sidebar"
            onClick={() => {
              setInspectorOpen(false);
            }}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="inspector-body">
          {selectedId === null ? (
            <GlobalSections />
          ) : (
            <ElementSections elementId={selectedId} />
          )}
        </div>
      </div>
    </>
  );
}

function CloseIcon() {
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
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
