// ============================================================================
// DisplayControls — readability controls for a dense canvas
// ============================================================================
// A small popover in the view-controls row that gathers every lever for taming
// a cluttered diagram, so the top bar stays tidy. All are independently
// toggleable:
//   - Density        → comfortable cards vs. compact (also tightens layout).
//   - Spacing        → ELK breathing room (cozy / normal / spacious).
//   - Edge labels    → only on hover/selection vs. always.
//   - Collapse subsystems by default → open as a clean overview of boxes.
//   - Bundle cross-group links → one ×N line between two expanded domains.
//   - Focus on select / on hover → dim all but the active node's neighborhood.
//   - Collapse all / Expand all  → fold or open every subsystem at once.
//
// The preferences persist (canvasPrefsStore). Collapse/expand-all are
// per-session view state (viewStore expand overrides).
// ============================================================================

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useCanvasPrefsStore } from "@/core/state/canvasPrefsStore";
import { useViewStore } from "@/core/state/viewStore";

import "@/features/layer-toggle/DisplayControls.css";

export default function DisplayControls() {
  const doc = useDocSnapshot();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // The menu is portaled to <body> so it escapes the floating panel's
  // `overflow: hidden` clipping; it's positioned with fixed coords anchored
  // under the trigger, right-aligned and clamped into the viewport.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const MENU_WIDTH = 272; // matches .display-controls-menu width (17rem)

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger === null) return;
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setPos({ top: rect.bottom + 8, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  const density = useCanvasPrefsStore((s) => s.density);
  const setDensity = useCanvasPrefsStore((s) => s.setDensity);
  const edgeLabels = useCanvasPrefsStore((s) => s.edgeLabels);
  const setEdgeLabels = useCanvasPrefsStore((s) => s.setEdgeLabels);
  const focusOnSelect = useCanvasPrefsStore((s) => s.focusOnSelect);
  const setFocusOnSelect = useCanvasPrefsStore((s) => s.setFocusOnSelect);
  const hoverFocus = useCanvasPrefsStore((s) => s.hoverFocus);
  const setHoverFocus = useCanvasPrefsStore((s) => s.setHoverFocus);
  const defaultCollapse = useCanvasPrefsStore((s) => s.defaultCollapse);
  const setDefaultCollapse = useCanvasPrefsStore((s) => s.setDefaultCollapse);
  const aggregateCrossGroup = useCanvasPrefsStore((s) => s.aggregateCrossGroup);
  const setAggregateCrossGroup = useCanvasPrefsStore((s) => s.setAggregateCrossGroup);
  const layoutSpacing = useCanvasPrefsStore((s) => s.layoutSpacing);
  const setLayoutSpacing = useCanvasPrefsStore((s) => s.setLayoutSpacing);
  const setGroupExpansionMany = useViewStore((s) => s.setGroupExpansionMany);
  const clearGroupExpansion = useViewStore((s) => s.clearGroupExpansion);

  // Close on outside-click / Esc while open. The menu lives in a portal, so an
  // outside click is one that hits neither the trigger nor the menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) setOpen(false);
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
    <div className="display-controls">
      <button
        ref={triggerRef}
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

      {open && pos !== null
        ? createPortal(
            <div
              ref={menuRef}
              className="display-controls-menu"
              id={menuId}
              role="dialog"
              aria-label="Display options"
              style={{ top: pos.top, left: pos.left }}
            >
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
                label="Spacing"
                value={layoutSpacing}
                options={[
                  { value: "cozy", label: "Cozy" },
                  { value: "normal", label: "Normal" },
                  { value: "spacious", label: "Spacious" },
                ]}
                onChange={setLayoutSpacing}
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

              <Toggle
                label="Collapse subsystems by default"
                checked={defaultCollapse}
                onChange={setDefaultCollapse}
              />
              <Toggle
                label="Bundle cross-group links"
                checked={aggregateCrossGroup}
                onChange={setAggregateCrossGroup}
              />
              <Toggle label="Focus on select" checked={focusOnSelect} onChange={setFocusOnSelect} />
              <Toggle label="Focus on hover" checked={hoverFocus} onChange={setHoverFocus} />

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
            </div>,
            document.body,
          )
        : null}
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

// ---------------------------------------------------------------------------
// Toggle — a labelled on/off switch reused for the boolean prefs.
// ---------------------------------------------------------------------------

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="display-controls-toggle">
      <span className="display-controls-row-label">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      <span className="display-controls-switch" aria-hidden />
    </label>
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
