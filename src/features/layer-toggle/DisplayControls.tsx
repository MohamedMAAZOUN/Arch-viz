// ============================================================================
// DisplayControls — readability controls for a dense canvas
// ============================================================================
// A small popover in the view-controls row that gathers the levers for taming
// a cluttered diagram, so the top bar stays tidy:
//   - Density        → comfortable cards vs. compact (also tightens layout).
//   - Edge labels    → only on hover/selection vs. always.
//   - Focus          → dim everything but the selected node's neighborhood.
//   - Collapse all   → fold every subsystem to a single box (expand restores).
//
// Density / labels / focus persist (canvasPrefsStore). Collapse/expand-all are
// per-session view state (viewStore expand overrides).
// ============================================================================

import { useEffect, useId, useRef, useState } from "react";

import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useCanvasPrefsStore } from "@/core/state/canvasPrefsStore";
import { useViewStore } from "@/core/state/viewStore";

import "@/features/layer-toggle/DisplayControls.css";

export default function DisplayControls() {
  const doc = useDocSnapshot();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const density = useCanvasPrefsStore((s) => s.density);
  const setDensity = useCanvasPrefsStore((s) => s.setDensity);
  const edgeLabels = useCanvasPrefsStore((s) => s.edgeLabels);
  const setEdgeLabels = useCanvasPrefsStore((s) => s.setEdgeLabels);
  const focusOnSelect = useCanvasPrefsStore((s) => s.focusOnSelect);
  const setFocusOnSelect = useCanvasPrefsStore((s) => s.setFocusOnSelect);
  const setGroupExpansionMany = useViewStore((s) => s.setGroupExpansionMany);
  const clearGroupExpansion = useViewStore((s) => s.clearGroupExpansion);

  // Close on outside-click / Esc while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (doc === null) return null;

  const groupIds = doc.elements.filter((e) => e.type === "group").map((e) => e.id);

  const collapseAll = () => {
    if (groupIds.length === 0) return;
    setGroupExpansionMany(Object.fromEntries(groupIds.map((id) => [id, false])));
  };
  const expandAll = () => {
    // Clear every per-element override so groups return to their expanded
    // default, then force-expand any group that defaults to collapsed.
    clearGroupExpansion();
    setGroupExpansionMany(Object.fromEntries(groupIds.map((id) => [id, true])));
  };

  return (
    <div className="display-controls" ref={rootRef}>
      <button
        type="button"
        className="display-controls-trigger"
        data-active={open}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        title="Display options"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <SlidersIcon />
        <span>display</span>
      </button>

      {open ? (
        <div className="display-controls-menu" id={menuId} role="dialog" aria-label="Display options">
          <Segmented
            label="Density"
            value={density}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
            onChange={setDensity}
          />
          <Segmented
            label="Edge labels"
            value={edgeLabels}
            options={[
              { value: "hover", label: "On hover" },
              { value: "always", label: "Always" },
            ]}
            onChange={setEdgeLabels}
          />

          <label className="display-controls-toggle">
            <span className="display-controls-row-label">Focus on select</span>
            <input
              type="checkbox"
              checked={focusOnSelect}
              onChange={(e) => {
                setFocusOnSelect(e.target.checked);
              }}
            />
            <span className="display-controls-switch" aria-hidden />
          </label>

          <div className="display-controls-group">
            <span className="display-controls-row-label">Subsystems</span>
            <div className="display-controls-actions">
              <button
                type="button"
                className="display-controls-action"
                onClick={collapseAll}
                disabled={groupIds.length === 0}
              >
                Collapse all
              </button>
              <button
                type="button"
                className="display-controls-action"
                onClick={expandAll}
                disabled={groupIds.length === 0}
              >
                Expand all
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented — a tiny labelled radio group reused for density / labels.
// ---------------------------------------------------------------------------

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="display-controls-group">
      <span className="display-controls-row-label">{label}</span>
      <div className="display-controls-segments" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            data-active={value === o.value}
            className="display-controls-segment"
            onClick={() => {
              onChange(o.value);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SlidersIcon() {
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
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </svg>
  );
}
