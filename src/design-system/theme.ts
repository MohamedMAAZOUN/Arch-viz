// ============================================================================
// Architecture Visualizer — Theme & Brand Runtime
// ============================================================================
// Framework-agnostic. Wraps:
//   1. Reading/writing data-theme + data-brand on the root element
//   2. Persisting the user's choice to localStorage
//   3. Falling back to `prefers-color-scheme` when the user has no choice yet
//   4. Firing change events so observers (React hooks, vanilla code) can react
//
// In React, wrap this with a tiny useTheme hook. In a Svelte component,
// subscribe via the change event. In vanilla JS, call apply() at startup.
// ============================================================================

export type Theme = "dark" | "light";
export type Brand = "neon" | "michelin";

export interface ThemePreferences {
  theme: Theme | "system";   // "system" = follow prefers-color-scheme
  brand: Brand;
}

const STORAGE_KEY = "architecture-visualizer:preferences";
const CHANGE_EVENT = "av:preferences-change";

const DEFAULTS: ThemePreferences = {
  theme: "system",
  brand: "michelin",
};

// ----------------------------------------------------------------------------
// Storage
// ----------------------------------------------------------------------------

function read(): ThemePreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw === "") return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;

    const themeCandidate = (parsed as Record<string, unknown>)["theme"];
    const brandCandidate = (parsed as Record<string, unknown>)["brand"];

    return {
      theme:
        isTheme(themeCandidate) || themeCandidate === "system"
          ? (themeCandidate)
          : DEFAULTS.theme,
      brand: isBrand(brandCandidate) ? brandCandidate : DEFAULTS.brand,
    };
  } catch {
    return DEFAULTS;
  }
}

function write(prefs: ThemePreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* localStorage quota, private mode, etc — silently ignore */
  }
}

function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light";
}

function isBrand(v: unknown): v is Brand {
  return v === "neon" || v === "michelin";
}

// ----------------------------------------------------------------------------
// System preference
// ----------------------------------------------------------------------------

function systemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Resolves "system" to a concrete theme. Idempotent — passing a concrete
 * theme returns it unchanged.
 */
export function resolveTheme(theme: Theme | "system"): Theme {
  return theme === "system" ? systemTheme() : theme;
}

// ----------------------------------------------------------------------------
// DOM application
// ----------------------------------------------------------------------------

/** Apply preferences to the root <html> element. */
export function apply(prefs: ThemePreferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset["theme"] = resolveTheme(prefs.theme);
  root.dataset["brand"] = prefs.brand;
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/** Get the current preferences (from storage; not necessarily what's on the DOM). */
export function getPreferences(): ThemePreferences {
  return read();
}

/** Update preferences (partial), persist, apply to DOM, fire change event. */
export function setPreferences(patch: Partial<ThemePreferences>): ThemePreferences {
  const next: ThemePreferences = { ...read(), ...patch };
  write(next);
  apply(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<ThemePreferences>(CHANGE_EVENT, { detail: next }));
  }
  return next;
}

/**
 * Initialize at app startup. Call ONCE, ideally in the document <head> before
 * paint to avoid a flash of the wrong theme. Sets up listeners for system
 * theme changes so the UI updates automatically if the user has theme: system.
 */
export function init(): ThemePreferences {
  const prefs = read();
  apply(prefs);

  // Re-apply when system theme changes, but only while user is on "system"
  if (typeof window !== "undefined") {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onSystemChange = (): void => {
      const current = read();
      if (current.theme === "system") apply(current);
    };
    mq.addEventListener("change", onSystemChange);
  }

  return prefs;
}

/**
 * Subscribe to preference changes. Returns an unsubscribe function.
 * Use this in React's useEffect, Svelte's onMount, or any vanilla setup.
 */
export function onChange(handler: (prefs: ThemePreferences) => void): () => void {
  if (typeof window === "undefined") {
    return (): void => {
      /* no-op in non-browser environments */
    };
  }
  const wrapped = (e: Event): void => {
    handler((e as CustomEvent<ThemePreferences>).detail);
  };
  window.addEventListener(CHANGE_EVENT, wrapped);
  return (): void => {
    window.removeEventListener(CHANGE_EVENT, wrapped);
  };
}

// ----------------------------------------------------------------------------
// React hook (optional helper)
// ----------------------------------------------------------------------------
// If we ever add React here, the hook is a 6-liner:
//
//   import { useState, useEffect } from "react";
//
//   export function useTheme() {
//     const [prefs, setPrefs] = useState(getPreferences);
//     useEffect(() => onChange(setPrefs), []);
//     return [prefs, setPreferences] as const;
//   }
//
// Keeping this file framework-free for now.

// ----------------------------------------------------------------------------
// Anti-flash snippet
// ----------------------------------------------------------------------------
// To avoid a flash-of-wrong-theme on page load, embed this snippet INLINE in
// the <head> of index.html, BEFORE any stylesheet:
//
//   <script>
//     (function() {
//       try {
//         var raw = localStorage.getItem("architecture-visualizer:preferences");
//         var p = raw ? JSON.parse(raw) : {};
//         var theme = p.theme === "system" || !p.theme
//           ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
//           : p.theme;
//         var brand = (p.brand === "neon" || p.brand === "michelin") ? p.brand : "michelin";
//         document.documentElement.dataset.theme = theme;
//         document.documentElement.dataset.brand = brand;
//       } catch (e) {}
//     })();
//   </script>
//
// Keep this snippet in sync with the constants above. It must be inline (not
// imported) because module imports run after first paint.
