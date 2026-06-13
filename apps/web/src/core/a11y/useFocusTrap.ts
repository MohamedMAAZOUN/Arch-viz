// ============================================================================
// useFocusTrap — keep keyboard focus inside an open overlay, restore on close
// ============================================================================
// For slide-in panels and modal overlays (settings, tour player). While active:
//   - focus is moved into the container on open,
//   - Tab / Shift+Tab cycle within the container's focusable children,
//   - focus returns to whatever was focused before, on unmount/deactivate.
//
// This is the only place that owns this behavior, so panels don't each
// re-implement it (see issue #29).
// ============================================================================

import { useEffect } from "react";

import type { RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Trap focus within `ref` while `active`. Restores focus to the previously
 * focused element when it deactivates or unmounts.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (container === null) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focusable descendants in DOM (tab) order. The selector already excludes
    // disabled controls and tabindex="-1"; we additionally drop anything inside
    // a hidden subtree. (We avoid layout-based visibility checks like
    // offsetParent so the behavior is deterministic and testable.)
    const focusables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.closest("[hidden]") === null && el.getAttribute("aria-hidden") !== "true",
      );

    // Move focus inside on open. Fall back to the container itself (made
    // programmatically focusable) when it has no focusable children yet.
    const initial = focusables()[0];
    if (initial !== undefined) {
      initial.focus();
    } else {
      container.tabIndex = -1;
      container.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) {
        e.preventDefault();
        container.focus();
        return;
      }
      const activeEl = document.activeElement;
      const outside = !(activeEl instanceof Node) || !container.contains(activeEl);
      if (e.shiftKey) {
        if (activeEl === first || outside) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || outside) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [ref, active]);
}
