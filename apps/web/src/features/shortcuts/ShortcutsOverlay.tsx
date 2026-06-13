// ============================================================================
// ShortcutsOverlay — discoverable keyboard-shortcut cheat sheet ("?")
// ============================================================================
// The app has real keyboard shortcuts (save, undo/redo, delete, multi-select)
// that were invisible until now. Pressing `?` anywhere outside a text field
// toggles this overlay; Esc or a click on the backdrop closes it. Mounted once
// from App.tsx.
//
// The modifier key renders as ⌘ on Apple platforms and Ctrl elsewhere so the
// hints match what the user actually presses.
// ============================================================================

import { useEffect, useState } from "react";

import "@/features/shortcuts/ShortcutsOverlay.css";

const MOD = isApplePlatform() ? "⌘" : "Ctrl";

interface Shortcut {
  readonly keys: readonly string[];
  readonly label: string;
}

interface ShortcutGroup {
  readonly title: string;
  readonly shortcuts: readonly Shortcut[];
}

const GROUPS: readonly ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { keys: ["?"], label: "Toggle this shortcuts panel" },
      { keys: [MOD, "S"], label: "Save project to file" },
      { keys: [MOD, "Z"], label: "Undo" },
      { keys: [MOD, "⇧", "Z"], label: "Redo" },
      { keys: ["Esc"], label: "Close menus / this panel" },
    ],
  },
  {
    title: "Canvas & selection",
    shortcuts: [
      { keys: ["Click"], label: "Select an element" },
      { keys: ["⇧", "Click"], label: "Add / remove from selection" },
      { keys: ["Drag"], label: "Box-select (with the select tool)" },
      { keys: ["Delete"], label: "Delete the selected element(s)" },
      { keys: ["Backspace"], label: "Delete the selected element(s)" },
    ],
  },
];

export default function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      // `?` is the discoverability convention. Ignore it while typing, and
      // ignore it when a modifier is held so it never shadows real chords.
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditingTextField(e.target)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={() => {
        setOpen(false);
      }}
    >
      <div
        className="shortcuts-panel"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="shortcuts-header">
          <h2 className="shortcuts-title">Keyboard shortcuts</h2>
          <button
            type="button"
            className="shortcuts-close"
            aria-label="Close"
            onClick={() => {
              setOpen(false);
            }}
          >
            ×
          </button>
        </div>

        <div className="shortcuts-groups">
          {GROUPS.map((group) => (
            <section key={group.title} className="shortcuts-group">
              <h3 className="shortcuts-group-title">{group.title}</h3>
              <ul className="shortcuts-list">
                {group.shortcuts.map((s) => (
                  <li key={s.label} className="shortcuts-row">
                    <span className="shortcuts-keys">
                      {s.keys.map((k, i) => (
                        <kbd key={i} className="shortcuts-key">
                          {k}
                        </kbd>
                      ))}
                    </span>
                    <span className="shortcuts-label">{s.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  // We only use this to pick the ⌘-vs-Ctrl glyph, so the user-agent string is
  // plenty (and avoids the deprecated `navigator.platform`). A miss is cosmetic.
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isEditingTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
