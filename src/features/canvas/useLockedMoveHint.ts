// ============================================================================
// useLockedMoveHint — nudge the user when they fight the locked layout
// ============================================================================
// While the "lock" cursor tool is active, nodes can't be dragged. If the user
// keeps trying to move one, that's a sign they don't realize why — so after a
// couple of attempts we surface an animated hint pointing at the tool control.
//
// Detection is passive (no preventDefault): a "move attempt" is a pointer-down
// that started on a node followed by enough travel before release. We count
// attempts within a short window and fire the hint on the Nth one; `nonce`
// changes each time so the caller can re-key the hint and replay its animation.
// ============================================================================

import { useEffect, useRef, useState } from "react";

/** Pointer travel (px) that turns a press-on-a-node into a "move attempt". */
const MOVE_THRESHOLD_PX = 6;
/** Attempts within the window before the hint appears. */
const ATTEMPTS_TO_HINT = 2;
/** Forget accumulated attempts after this idle gap. */
const ATTEMPT_WINDOW_MS = 6000;
/** How long the hint stays up before auto-dismissing. */
const HINT_VISIBLE_MS = 2600;

export interface LockedMoveHint {
  visible: boolean;
  /** Increments on each trigger so the hint can remount and replay its animation. */
  nonce: number;
}

export function useLockedMoveHint(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean,
): LockedMoveHint {
  const [state, setState] = useState<LockedMoveHint>({ visible: false, nonce: 0 });

  const press = useRef<{ x: number; y: number; onNode: boolean; counted: boolean } | null>(null);
  const attempts = useRef(0);
  const windowTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      // Leaving lock mode: hide any open hint and forget attempts.
      setState((s) => (s.visible ? { ...s, visible: false } : s));
      attempts.current = 0;
      return;
    }
    const el = containerRef.current;
    if (el === null) return;

    const clearWindowTimer = () => {
      if (windowTimer.current !== null) {
        window.clearTimeout(windowTimer.current);
        windowTimer.current = null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      const onNode = target instanceof Element && target.closest(".react-flow__node") !== null;
      press.current = { x: e.clientX, y: e.clientY, onNode, counted: false };
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = press.current;
      if (p === null || !p.onNode || p.counted) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < MOVE_THRESHOLD_PX) return;

      p.counted = true; // one attempt per press
      attempts.current += 1;
      clearWindowTimer();
      windowTimer.current = window.setTimeout(() => {
        attempts.current = 0;
      }, ATTEMPT_WINDOW_MS);

      if (attempts.current >= ATTEMPTS_TO_HINT) {
        attempts.current = 0;
        clearWindowTimer();
        setState((s) => ({ visible: true, nonce: s.nonce + 1 }));
        if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => {
          setState((s) => ({ ...s, visible: false }));
        }, HINT_VISIBLE_MS);
      }
    };

    const onPointerUp = () => {
      press.current = null;
    };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      clearWindowTimer();
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      press.current = null;
    };
  }, [active, containerRef]);

  return state;
}
