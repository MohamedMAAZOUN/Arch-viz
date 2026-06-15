// ============================================================================
// ArchitecturePicker — searchable switcher merging two catalog sources
// ============================================================================
// A command-palette overlay for choosing what to open. It merges:
//   • server projects from GET /projects (your own + shared + public), and
//   • bundled architectures auto-discovered from the architectures/ folder —
//     the offline seed/fallback (ADR 0013, demoted by ADR 0014).
// Server and bundled entries are visually distinguished and the list still
// searches bundled architecture names AND the names of the nodes inside.
// When the server is unreachable the picker degrades gracefully to bundled
// architectures only.
//
// Opened from the project pill in the TopBar and via the ⌘K / Ctrl-K shortcut.
// Keyboard: ↑/↓ to move, Enter to open, Esc to close.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import { useFocusTrap } from "@/core/a11y/useFocusTrap";
import { projectsApi, type ServerProject } from "@/core/api/projects";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { openBundledArchitecture, openServerProject } from "@/core/project/openProject";
import { notify } from "@/core/state/notificationStore";
import { useProjectContextStore } from "@/core/state/projectContextStore";
import { getArchitectureIndex } from "@/data/architectures";

import type { ArchitectureEntry } from "@/data/architectures";

import "@/features/architecture-picker/ArchitecturePicker.css";

interface ArchitecturePickerProps {
  onClose: () => void;
}

/** A flat, keyboard-navigable item from either source. */
type PickerItem =
  | { readonly kind: "server"; readonly project: ServerProject }
  | { readonly kind: "bundled"; readonly entry: ArchitectureEntry; readonly matchedNodes: string[] };

const itemId = (item: PickerItem): string =>
  item.kind === "server" ? `server-${item.project.id}` : `bundled-${item.entry.id}`;

export default function ArchitecturePicker({ onClose }: ArchitecturePickerProps) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<ArchitectureEntry[] | null>(null);
  const [serverProjects, setServerProjects] = useState<readonly ServerProject[]>([]);
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const doc = useDocSnapshot();
  const currentName = doc?.project.name;
  const openServerId = useProjectContextStore((s) => s.server?.id ?? null);

  useFocusTrap(panelRef);

  // Build the bundled index and fetch server projects in parallel on open. A
  // server failure is silent — bundled architectures still render.
  useEffect(() => {
    let alive = true;
    void getArchitectureIndex().then((result) => {
      if (alive) setEntries(result);
    });
    void projectsApi.list().then((result) => {
      if (alive && result.ok) setServerProjects(result.value);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const items = useMemo<PickerItem[]>(() => {
    const q = query.trim().toLowerCase();
    const out: PickerItem[] = [];
    for (const project of serverProjects) {
      if (q === "" || project.name.toLowerCase().includes(q)) out.push({ kind: "server", project });
    }
    for (const entry of entries ?? []) {
      if (q === "") {
        out.push({ kind: "bundled", entry, matchedNodes: [] });
        continue;
      }
      const nameHit = entry.name.toLowerCase().includes(q);
      const matchedNodes = entry.nodeNames.filter((n) => n.toLowerCase().includes(q));
      if (nameHit || matchedNodes.length > 0) out.push({ kind: "bundled", entry, matchedNodes });
    }
    return out;
  }, [entries, serverProjects, query]);

  useEffect(() => {
    setActive(0);
  }, [query, entries, serverProjects]);

  const select = (item: PickerItem) => {
    const action =
      item.kind === "server" ? openServerProject(item.project.id) : openBundledArchitecture(item.entry.id);
    const name = item.kind === "server" ? item.project.name : item.entry.name;
    void action.then((result) => {
      if (!result.ok) {
        notify({ level: "error", title: `Couldn't load “${name}”`, detail: result.error });
        return;
      }
      onClose();
    });
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item !== undefined) select(item);
    }
  };

  const loading = entries === null;
  const activeItem = items[active];

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
            placeholder="Search projects, architectures and nodes…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="archpicker-list"
            aria-activedescendant={activeItem !== undefined ? `archpicker-opt-${itemId(activeItem)}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="archpicker-kbd">esc</kbd>
        </div>

        <ul id="archpicker-list" role="listbox" className="archpicker-list">
          {loading ? (
            <li className="archpicker-empty">Loading…</li>
          ) : items.length === 0 ? (
            <li className="archpicker-empty">Nothing matches “{query}”.</li>
          ) : (
            items.map((item, i) => {
              const prev = items[i - 1];
              const showHeader = i === 0 || prev?.kind !== item.kind;
              const current =
                item.kind === "server"
                  ? item.project.id === openServerId
                  : openServerId === null && item.entry.name === currentName;
              return (
                <li key={itemId(item)} role="presentation">
                  {showHeader ? (
                    <p className="archpicker-section" aria-hidden>
                      {item.kind === "server" ? "Your projects" : "Bundled architectures"}
                    </p>
                  ) : null}
                  <PickerRow
                    item={item}
                    active={i === active}
                    current={current}
                    onActivate={() => {
                      setActive(i);
                    }}
                    onSelect={() => {
                      select(item);
                    }}
                  />
                </li>
              );
            })
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
          <span className="archpicker-footer-hint">server + bundled · ⌘K</span>
        </footer>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// PickerRow — a single result; scrolls itself into view when it goes active.
// ---------------------------------------------------------------------------

interface PickerRowProps {
  item: PickerItem;
  active: boolean;
  current: boolean;
  onActivate: () => void;
  onSelect: () => void;
}

function PickerRow({ item, active, current, onActivate, onSelect }: PickerRowProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const name = item.kind === "server" ? item.project.name : item.entry.name;

  return (
    <button
      ref={ref}
      type="button"
      id={`archpicker-opt-${itemId(item)}`}
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
          {name}
          <span
            className={`archpicker-badge ${item.kind === "server" ? "archpicker-badge--server" : "archpicker-badge--local"}`}
          >
            {item.kind === "server" ? "server" : "local"}
          </span>
          {current ? <span className="archpicker-current">current</span> : null}
        </span>
        {item.kind === "bundled" ? (
          <span className="archpicker-row-count">{item.entry.elementCount} nodes</span>
        ) : null}
      </span>

      {item.kind === "bundled" && item.entry.description !== undefined ? (
        <span className="archpicker-row-desc">{item.entry.description}</span>
      ) : null}

      {item.kind === "bundled" && item.matchedNodes.length > 0 ? (
        <span className="archpicker-row-nodes">
          <span className="archpicker-row-nodes-label">matches</span>
          {item.matchedNodes.slice(0, 6).map((n) => (
            <span key={n} className="archpicker-chip">
              {n}
            </span>
          ))}
          {item.matchedNodes.length > 6 ? (
            <span className="archpicker-chip archpicker-chip--more">+{item.matchedNodes.length - 6}</span>
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
