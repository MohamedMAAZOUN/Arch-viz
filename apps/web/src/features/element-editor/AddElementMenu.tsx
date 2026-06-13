// ============================================================================
// AddElementMenu — create a new element from a small type palette
// ============================================================================
// A floating "+" control over the canvas. Picking a type builds a minimal valid
// element (introduced at the current MVP so it's visible immediately), commits
// it through docStore (one undo step), and selects it so the inspector opens
// ready for naming.
// ============================================================================

import { useEffect, useRef, useState } from "react";

import { docStore } from "@/core/doc/DocStore";
import { buildElement } from "@/core/doc/authoring";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useSelectionStore } from "@/core/state/selectionStore";
import { useViewStore } from "@/core/state/viewStore";

import type { ElementType } from "@arch-vis/schema";

import "@/features/element-editor/AddElementMenu.css";

const ELEMENT_TYPES: readonly ElementType[] = [
  "service",
  "database",
  "queue",
  "frontend",
  "external",
  "actor",
  "group",
];

export default function AddElementMenu() {
  const doc = useDocSnapshot();
  const currentMvp = useViewStore((s) => s.currentMvp);
  const select = useSelectionStore((s) => s.select);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Node && rootRef.current !== null && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (doc === null) return null;

  // Introduce at the current scrub point so the new element is visible now;
  // fall back to the earliest MVP if nothing is selected yet.
  const introducedIn = currentMvp ?? [...doc.mvps].sort((a, b) => a.order - b.order)[0]?.id ?? null;
  if (introducedIn === null) return null;

  const addElement = (type: ElementType) => {
    const takenIds = new Set(doc.elements.map((e) => e.id));
    const element = buildElement({ type, takenIds, introducedIn });
    docStore.addElement(element);
    select(element.id);
    setOpen(false);
  };

  return (
    <div className="add-element" ref={rootRef}>
      <button
        type="button"
        className="add-element-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add element"
        title="Add element"
        onClick={() => {
          setOpen((prev) => !prev);
        }}
      >
        <PlusIcon />
        <span>add</span>
      </button>

      {open ? (
        <div className="add-element-menu" role="menu" aria-label="Element type">
          {ELEMENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              className="add-element-item"
              onClick={() => {
                addElement(type);
              }}
            >
              {type}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
