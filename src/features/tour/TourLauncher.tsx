// ============================================================================
// TourLauncher — frosted pill that lists the project's tours and starts one
// ============================================================================
// Mounted from App over the canvas (top-right of the stage). Visible only when
// the document defines at least one tour and no tour is currently playing —
// once a tour starts, the TourPlayer overlay takes over. Picking a tour calls
// tourStore.start(); the Canvas reacts and drives the camera.
// ============================================================================

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useTourStore } from "@/core/state/tourStore";
import { duration, ease } from "@/design-system/tokens";

import "@/features/tour/TourLauncher.css";

export default function TourLauncher() {
  const doc = useDocSnapshot();
  const activeTourId = useTourStore((s) => s.activeTourId);
  const start = useTourStore((s) => s.start);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tours = doc?.tours ?? [];
  if (tours.length === 0 || activeTourId !== null) return null;

  return (
    <div className="tour-launcher" ref={rootRef}>
      <button
        type="button"
        className="tour-launcher-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <PlayIcon />
        <span>Tours</span>
        <span className="tour-launcher-count">{tours.length}</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.ul
            className="tour-launcher-menu"
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: duration.fast / 1000, ease: ease.out }}
          >
            {tours.map((tour) => (
              <li key={tour.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="tour-launcher-item"
                  onClick={() => {
                    setOpen(false);
                    start(tour.id, tour.steps.length);
                  }}
                >
                  <span className="tour-launcher-item-name">{tour.name}</span>
                  {tour.description !== undefined ? (
                    <span className="tour-launcher-item-desc">{tour.description}</span>
                  ) : null}
                  <span className="tour-launcher-item-meta">
                    {tour.steps.length} {tour.steps.length === 1 ? "step" : "steps"}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}
