// ============================================================================
// FloatingPanel — one frosted-glass panel that floats over the canvas
// ============================================================================
// Collapses to an edge affordance (a circle on the left/right, a rounded
// rectangle on top) and morphs open via a shared Motion layout. Behaviour:
//   - Pinned   → stays expanded, ignores outside-click / Esc.
//   - Unpinned → peek-on-demand: opening from the pill, dismissed by clicking
//     the canvas or pressing Esc (unless `keepOpen` says otherwise).
// View state (open / pinned) lives in uiStore; this component is presentation.
// ============================================================================

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { useUiStore } from "@/core/state/uiStore";

import type { PanelId } from "@/core/state/uiStore";
import type { Transition } from "motion/react";

import "@/features/panels/FloatingPanel.css";

type Side = "top" | "left" | "right";

interface FloatingPanelProps {
  readonly id: PanelId;
  readonly side: Side;
  readonly title: string;
  /** Optional text shown next to the icon on the top (rectangle) pill. */
  readonly pillLabel?: string;
  readonly icon: React.ReactNode;
  /** While true, outside-click / Esc won't collapse the panel (e.g. an element
   *  is selected and the inspector should stay put). */
  readonly keepOpen?: boolean;
  readonly children: React.ReactNode;
}

export default function FloatingPanel({
  id,
  side,
  title,
  pillLabel,
  icon,
  keepOpen = false,
  children,
}: FloatingPanelProps) {
  const { open, pinned } = useUiStore((s) => s.panels[id]);
  const openPanel = useUiStore((s) => s.openPanel);
  const closePanel = useUiStore((s) => s.closePanel);
  const togglePanelPinned = useUiStore((s) => s.togglePanelPinned);
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  const dismissable = open && !pinned && !keepOpen;

  // Outside-click + Esc dismissal for unpinned, open panels. We close on a
  // genuine *click* outside the panel, not on pointerdown — otherwise the press
  // that begins a canvas pan or node drag would collapse the panel. A click is
  // a pointerdown + pointerup on a target outside the panel with negligible
  // movement between them (anything more is a drag, which must not dismiss).
  useEffect(() => {
    if (!dismissable) return;
    const DRAG_SLOP = 6; // px of movement allowed before it counts as a drag
    let downX = 0;
    let downY = 0;
    let downOutside = false;

    const isOutside = (target: EventTarget | null) =>
      rootRef.current !== null && !rootRef.current.contains(target as Node);

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downOutside = isOutside(e.target);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!downOutside || !isOutside(e.target)) return;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved <= DRAG_SLOP) closePanel(id);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel(id);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dismissable, closePanel, id]);

  const transition: Transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring", stiffness: 420, damping: 38 };

  // During the shared-element morph the pill (icon included) scales up toward
  // the panel's box, which otherwise reads as the icon "ballooning" before the
  // text appears. Blurring + fading the pill on exit and the panel's content on
  // enter masks that scale, so the swap reads as a soft cross-dissolve rather
  // than a stretching glyph. Disabled under reduced-motion.
  const BLUR = "blur(8px)";
  const fadeBlur: Transition = reduceMotion
    ? transition
    : {
        ...transition,
        opacity: { duration: 0.18, ease: "easeOut" },
        filter: { duration: 0.24, ease: "easeOut" },
      };
  const contentMotion = reduceMotion
    ? {}
    : {
        initial: { filter: BLUR },
        animate: { filter: "blur(0px)" },
        transition: { filter: { duration: 0.26, ease: "easeOut" } } as Transition,
      };

  return (
    <div className="floating-zone" data-side={side} ref={rootRef}>
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.section
            key="panel"
            layoutId={`floating-${id}`}
            className="floating-panel"
            transition={transition}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label={title}
          >
            <motion.header
              className="floating-panel-header"
              transition={transition}
              {...contentMotion}
            >
              <span className="floating-panel-title">{title}</span>
              <div className="floating-panel-actions">
                <button
                  type="button"
                  className="floating-panel-btn"
                  data-active={pinned}
                  onClick={() => {
                    togglePanelPinned(id);
                  }}
                  aria-pressed={pinned}
                  aria-label={pinned ? "Unpin panel" : "Pin panel"}
                  title={pinned ? "Unpin (auto-hide)" : "Pin (keep open)"}
                >
                  <PinIcon pinned={pinned} />
                </button>
                <button
                  type="button"
                  className="floating-panel-btn"
                  onClick={() => {
                    closePanel(id);
                  }}
                  aria-label="Collapse panel"
                  title="Collapse"
                >
                  <CollapseIcon side={side} />
                </button>
              </div>
            </motion.header>
            <motion.div className="floating-panel-body" {...contentMotion}>
              {children}
            </motion.div>
          </motion.section>
        ) : (
          <motion.button
            key="pill"
            type="button"
            layoutId={`floating-${id}`}
            className="floating-pill"
            data-side={side}
            transition={fadeBlur}
            initial={reduceMotion ? false : { opacity: 0, filter: BLUR }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: BLUR }}
            onClick={() => {
              openPanel(id);
            }}
            aria-expanded={false}
            aria-label={`Open ${title}`}
            title={`Open ${title}`}
          >
            {icon}
            <span className="floating-pill-label">{pillLabel ?? title}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={pinned ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 17v5" />
      <path d="M9 10.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.5l2 3.5H7z" />
    </svg>
  );
}

function CollapseIcon({ side }: { side: Side }) {
  // Chevron pointing toward the edge the panel tucks into.
  const rotate = side === "left" ? -90 : side === "right" ? 90 : 0;
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
      style={{ transform: `rotate(${String(rotate)}deg)` }}
    >
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}
