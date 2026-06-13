// ============================================================================
// TourPlayer — focused playback overlay for a guided tour
// ============================================================================
// Mounted (lazily) only while a tour is active. Owns the playback timer and
// keyboard, and renders the caption + transport controls. It does NOT move the
// camera or dim nodes — that's the Canvas, which watches the same tourStore.
//
// Controls: prev · play/pause · next · step dots · exit.
// Keyboard:  Space / →  / ↓  advance · ← / ↑  back · Esc exit.
// Play auto-advances using each step's `duration` and stops on the last step.
// ============================================================================

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";

import { useFocusTrap } from "@/core/a11y/useFocusTrap";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useTourStore } from "@/core/state/tourStore";
import { durationSec, ease } from "@/design-system/tokens";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

import "@/features/tour/TourPlayer.css";

export default function TourPlayer() {
  const doc = useDocSnapshot();
  const activeTourId = useTourStore((s) => s.activeTourId);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const isPlaying = useTourStore((s) => s.isPlaying);
  const next = useTourStore((s) => s.next);
  const prev = useTourStore((s) => s.prev);
  const goTo = useTourStore((s) => s.goTo);
  const exit = useTourStore((s) => s.exit);
  const togglePlay = useTourStore((s) => s.togglePlay);

  const tour = doc?.tours?.find((t) => t.id === activeTourId) ?? null;
  const step = tour?.steps[stepIndex] ?? null;
  const stepCount = tour?.steps.length ?? 0;
  const isLast = stepCount > 0 && stepIndex >= stepCount - 1;

  // Keep focus on the transport controls while the tour overlay is up, and
  // restore it to the launcher when the tour exits (issue #29).
  const playerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(playerRef, tour !== null && step !== null);

  // Auto-advance while playing, using the step's own duration. Reduced motion
  // caps the dwell so a paused-looking tour doesn't sit too long.
  useEffect(() => {
    if (!isPlaying || step === null) return;
    const dwell = prefersReducedMotion() ? Math.min(step.duration, 1500) : step.duration;
    const timer = window.setTimeout(() => {
      next();
    }, dwell);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isPlaying, stepIndex, step, next]);

  // Keyboard transport. Active only while a tour is playing.
  useEffect(() => {
    if (activeTourId === null) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case " ":
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          prev();
          break;
        case "Escape":
          e.preventDefault();
          exit();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [activeTourId, next, prev, exit]);

  if (tour === null || step === null) return null;

  return (
    <div className="tour-player" role="region" aria-label={`Tour: ${tour.name}`} ref={playerRef}>
      <button type="button" className="tour-exit" onClick={exit} aria-label="Exit tour">
        <span className="tour-exit-label">Exit</span>
        <span className="tour-exit-key">Esc</span>
      </button>

      <div className="tour-dock">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIndex}
            className="tour-caption-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: durationSec.base, ease: ease.out }}
          >
            <div className="tour-caption-eyebrow">
              {tour.name} · {stepIndex + 1}/{stepCount}
            </div>
            {step.caption !== undefined ? (
              <div className="tour-caption-text">{step.caption}</div>
            ) : null}
          </motion.div>
        </AnimatePresence>

        <div className="tour-controls">
          <button
            type="button"
            className="tour-btn"
            onClick={prev}
            disabled={stepIndex === 0}
            aria-label="Previous step"
          >
            <PrevIcon />
          </button>

          <button
            type="button"
            className="tour-btn tour-btn-primary"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button
            type="button"
            className="tour-btn"
            onClick={next}
            disabled={isLast}
            aria-label="Next step"
          >
            <NextIcon />
          </button>

          <div className="tour-dots" role="tablist" aria-label="Tour steps">
            {tour.steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className="tour-dot"
                data-active={i === stepIndex}
                aria-label={`Go to step ${String(i + 1)}`}
                aria-selected={i === stepIndex}
                role="tab"
                onClick={() => {
                  goTo(i);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transport icons
// ---------------------------------------------------------------------------

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M18 6L9 12l9 6V6z" fill="currentColor" />
      <rect x="6" y="6" width="2" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M6 6l9 6-9 6V6z" fill="currentColor" />
      <rect x="16" y="6" width="2" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}
