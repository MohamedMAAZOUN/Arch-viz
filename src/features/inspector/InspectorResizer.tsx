// ============================================================================
// InspectorResizer — drag handle to resize the inspector
// ============================================================================
// Vertical strip on the inspector's left edge. Pointer-events drive a delta
// from the starting width; values clamp inside the uiStore.
//
// Uses pointer events (not mouse) so it works with touch and pen. Captures
// the pointer so the drag continues even when leaving the strip.
// ============================================================================

import { useUiStore } from "@/core/state/uiStore";

import "@/features/inspector/InspectorResizer.css";

const FALLBACK_WIDTH_PX = 480;

export default function InspectorResizer() {
  const setInspectorWidth = useUiStore((s) => s.setInspectorWidth);
  const resetInspectorWidth = useUiStore((s) => s.resetInspectorWidth);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    // Read the inspector element's actual rendered width as the start.
    // (More robust than reading from the store, which may be null = default.)
    const inspectorEl = handle.closest("aside.app-inspector");
    const startWidth = inspectorEl?.getBoundingClientRect().width ?? FALLBACK_WIDTH_PX;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX; // drag left → wider
      setInspectorWidth(startWidth + delta);
    };

    const onUp = (upEvent: PointerEvent) => {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  // Double-click to reset to default proportions
  const handleDoubleClick = () => {
    resetInspectorWidth();
  };

  return (
    <button
      type="button"
      className="inspector-resizer"
      aria-label="Resize sidebar"
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
    >
      <span className="inspector-resizer-grip" />
    </button>
  );
}
