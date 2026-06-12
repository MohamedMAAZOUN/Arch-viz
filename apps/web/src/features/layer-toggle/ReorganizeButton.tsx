// ============================================================================
// ReorganizeButton — wipe manual position overrides for the current layer
// ============================================================================
// Visible only when the current layer actually has overrides. The act of
// pressing it is a normal mutation, so it goes through undo/redo like any
// other change.
// ============================================================================

import { docStore } from "@/core/doc/DocStore";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useViewStore } from "@/core/state/viewStore";

import "@/features/layer-toggle/ReorganizeButton.css";

export default function ReorganizeButton() {
  const doc = useDocSnapshot();
  const currentLayer = useViewStore((s) => s.currentLayer);

  if (doc === null) return null;

  const overrides = doc.layout?.[currentLayer];
  const hasOverrides = overrides !== undefined && Object.keys(overrides).length > 0;
  if (!hasOverrides) return null;

  const overrideCount = Object.keys(overrides).length;

  return (
    <button
      type="button"
      className="reorganize-btn"
      onClick={() => {
        docStore.clearLayerOverrides(currentLayer);
      }}
      title={`Reset ${String(overrideCount)} manual position${overrideCount === 1 ? "" : "s"} on this layer`}
    >
      <ReorganizeIcon />
      <span>reorganize</span>
    </button>
  );
}

function ReorganizeIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}
