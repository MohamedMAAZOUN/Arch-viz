// ============================================================================
// ArchitecturePicker — searchable switcher for bundled architectures
// ============================================================================
// A command-palette-style overlay for choosing which architecture to open. It
// lists everything auto-discovered from the architectures/ folder and searches
// on BOTH the architecture name and the names of the nodes inside it — so
// typing "redis" finds every architecture that contains a node named Redis.
//
// Opened from the project pill in the TopBar and via the ⌘K / Ctrl-K shortcut.
// Keyboard: ↑/↓ to move, Enter to open, Esc to close.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import { useFocusTrap } from "@/core/a11y/useFocusTrap";
import { loadArchitectureById } from "@/core/doc/loadArchitectureById";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { notify } from "@/core/state/notificationStore";
import { getArchitectureIndex } from "@/data/architectures";

import type { ArchitectureEntry } from "@/data/architectures";

import "@/features/architecture-picker/ArchitecturePicker.css";

interface ArchitecturePickerProps {
  onClose: () => void;
}

interface Match {
  entry: ArchitectureEntry;
  /** Node names that matched the query — shown so the hit is explained. */
  matchedNodes: string[];
}

export default function ArchitecturePicker({ onClose }: ArchitecturePickerProps) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<ArchitectureEntry[] | null>(null);
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const doc = useDocSnapshot();
  const currentName = doc?.project.name;

  useFocusTrap(panelRef);

  // Build (and cache) the searchable index on first open. The picker shows a
  // loading row until it resolves.
  useEffect(() => {
    let alive = true;
    void getArchitectureIndex().then((result) => {
      if (alive) setEntries(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Autofocus the search field on open.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Esc (when the input isn't going to handle it itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const matches = useMemo<Match[]>(() => {
    if (entries === null) return [];
    const q = query.trim().toLowerCase();
    if (q === "") return entries.map((entry) => ({ entry, matchedNodes: [] }));
    const out: Match[] = [];
    for (const entry of entries) {
      const nameHit = entry.name.toLowerCase().includes(q);
      const matchedNodes = entry.nodeNames.filter((n) => n.toLowerCase().includes(q));
      if (nameHit || matchedNodes.length > 0) out.push({ entry, matchedNodes });
    }
    return out;
  }, [entries, query]);

  // Reset the highlighted row whenever the result set changes.
  useEffect(() => {
    setActive(0);
  }, [query, entries]);

  const select = (entry: ArchitectureEntry) => {
    void loadArchitectureById(entry.id).then((result) => {
      if (!result.ok) {
        notify({
          level: "error",
          title: `Couldn't load “${entry.name}”`,
          detail: result.error,
        });
        return;
      }
      onClose();
    });
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = matches[active];
      if (m !== undefined) select(m.entry);
    }
  };

  return (
    <>
      <div className="archpicker-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className="archpicker"
        role="dialog"
        aria-modal="true"
        aria-label="Switch architecture"
      >
        <div className="archpicker-search">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            className="archpicker-input"
            placeholder="Search architectures and nodes…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="archpicker-list"
            aria-activedescendant={
              matches[active] !== undefined
                ? `archpicker-opt-${matches[active].entry.id}`
                : undefined
            }
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="archpicker-kbd">esc</kbd>
        </div>

        <ul id="archpicker-list" role="listbox" className="archpicker-list">
          {entries === null ? (
            <li className="archpicker-empty">Loading architectures…</li>
          ) : matches.length === 0 ? (
            <li className="archpicker-empty">No architectures match “{query}”.</li>
          ) : (
            matches.map((m, i) => (
              <li key={m.entry.id} role="presentation">
                <PickerRow
                  match={m}
                  active={i === active}
                  current={m.entry.name === currentName}
                  onActivate={() => {
                    setActive(i);
                  }}
                  onSelect={() => {
                    select(m.entry);
                  }}
                />
              </li>
            ))
          )}
        </ul>

        <footer className="archpicker-footer">
          <span>
            <kbd className="archpicker-kbd">↑</kbd>
            <kbd className="archpicker-kbd">↓</kbd> to navigate
          </span>
          <span>
            <kbd className="archpicker-kbd">↵</kbd> to open
          </span>
          <span className="archpicker-footer-hint">
            searches names and nodes · drop a .yaml in /architectures
          </span>
        </footer>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// PickerRow — a single result; scrolls itself into view when it goes active.
// ---------------------------------------------------------------------------

interface PickerRowProps {
  match: Match;
  active: boolean;
  current: boolean;
  onActivate: () => void;
  onSelect: () => void;
}

function PickerRow({ match, active, current, onActivate, onSelect }: PickerRowProps) {
  const { entry, matchedNodes } = match;
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <button
      ref={ref}
      type="button"
      id={`archpicker-opt-${entry.id}`}
      role="option"
      aria-selected={active}
      className="archpicker-row"
      data-active={active}
      data-current={current}
      onClick={onSelect}
      onMouseMove={onActivate}
    >
      <span className="archpicker-row-head">
        <span className="archpicker-row-name">
          {entry.name}
          {current ? <span className="archpicker-current">current</span> : null}
        </span>
        <span className="archpicker-row-count">{entry.elementCount} nodes</span>
      </span>
      {entry.description !== undefined ? (
        <span className="archpicker-row-desc">{entry.description}</span>
      ) : null}
      {matchedNodes.length > 0 ? (
        <span className="archpicker-row-nodes">
          <span className="archpicker-row-nodes-label">matches</span>
          {matchedNodes.slice(0, 6).map((n) => (
            <span key={n} className="archpicker-chip">
              {n}
            </span>
          ))}
          {matchedNodes.length > 6 ? (
            <span className="archpicker-chip archpicker-chip--more">
              +{matchedNodes.length - 6}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg
      className="archpicker-search-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
