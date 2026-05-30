// ============================================================================
// FloatingPanels — the three-zone floating workspace over the canvas
// ============================================================================
// Top    → view controls (layer / MVP / reorganize)
// Left   → navigator (project overview, search, diagnostics) — the global view
// Right  → inspector for the selected element
//
// The right panel follows selection when unpinned: it appears when you select
// an element and tucks away when you deselect, so inspecting feels automatic.
// ============================================================================

import { useEffect } from "react";

import { useSelectionStore } from "@/core/state/selectionStore";
import { useUiStore } from "@/core/state/uiStore";
import ElementSections from "@/features/inspector/sections/ElementSections";
import GlobalSections from "@/features/inspector/sections/GlobalSections";
import FloatingPanel from "@/features/panels/FloatingPanel";
import ViewControlsPanel from "@/features/panels/ViewControlsPanel";

// The panels render the existing inspector sections, which rely on these styles.
import "@/features/inspector/Inspector.css";

export default function FloatingPanels() {
  const selectedId = useSelectionStore((s) => s.selectedId);
  const openPanel = useUiStore((s) => s.openPanel);
  const closePanel = useUiStore((s) => s.closePanel);
  const rightPinned = useUiStore((s) => s.panels.right.pinned);

  // Drive the right inspector from selection (when unpinned): open on select,
  // tuck away on deselect.
  useEffect(() => {
    if (selectedId !== null) {
      openPanel("right");
    } else if (!rightPinned) {
      closePanel("right");
    }
  }, [selectedId, rightPinned, openPanel, closePanel]);

  return (
    <>
      <FloatingPanel id="top" side="top" title="view" pillLabel="view" icon={<ViewIcon />}>
        <ViewControlsPanel />
      </FloatingPanel>

      <FloatingPanel id="left" side="left" title="navigator" icon={<NavigatorIcon />}>
        <GlobalSections />
      </FloatingPanel>

      <FloatingPanel
        id="right"
        side="right"
        title="inspector"
        icon={<InspectorIcon />}
        keepOpen={selectedId !== null}
      >
        {selectedId === null ? (
          <div className="floating-panel-hint">Select an element to inspect it.</div>
        ) : (
          <ElementSections elementId={selectedId} />
        )}
      </FloatingPanel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pill icons
// ---------------------------------------------------------------------------

function ViewIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="9" cy="8" r="2" fill="var(--color-bg-2)" />
      <circle cx="15" cy="16" r="2" fill="var(--color-bg-2)" />
    </svg>
  );
}

function NavigatorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <polygon points="15.5 8.5 10.5 10.5 8.5 15.5 13.5 13.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function InspectorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="14" y1="4" x2="14" y2="20" />
    </svg>
  );
}
