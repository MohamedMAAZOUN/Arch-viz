// ============================================================================
// GlobalSections — inspector sections when nothing is selected
// ============================================================================
// Project-wide views. Search filters elements by name/id/tag/owner and
// clicking a result selects + reveals it. Diagnostics surface structural
// problems: orphan nodes, broken connection endpoints, lifecycle gaps.
// ============================================================================

import { useMemo, useState } from "react";

import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useSelectionStore } from "@/core/state/selectionStore";
import { useViewStore } from "@/core/state/viewStore";
import { VirtualList, VIRTUALIZE_THRESHOLD } from "@/features/inspector/VirtualList";
import { ExportSection } from "@/features/inspector/sections/ExportSection";
import { Section } from "@/features/inspector/sections/Section";

import type { Element, ProjectDocument } from "@/core/schema/schema";

// A search-result row is a single line plus its inter-row gap. Used to window
// the list once it grows past the virtualization threshold.
const SEARCH_ROW_HEIGHT = 44;
const SEARCH_VIEWPORT_HEIGHT = 320;

export default function GlobalSections() {
  const doc = useDocSnapshot();
  const currentMvp = useViewStore((s) => s.currentMvp);
  const setMvp = useViewStore((s) => s.setMvp);

  if (doc === null) {
    return (
      <Section title="Project overview" defaultOpen>
        <div className="inspector-empty-row">No project loaded.</div>
      </Section>
    );
  }

  const sortedMvps = [...doc.mvps].sort((a, b) => a.order - b.order);

  return (
    <>
      <Section title="Project overview" defaultOpen>
        <div className="kv-grid">
          <span className="kv-key">name</span>
          <span className="kv-val">{doc.project.name}</span>
          <span className="kv-key">elements</span>
          <span className="kv-val">{doc.elements.length}</span>
          <span className="kv-key">connections</span>
          <span className="kv-val">{doc.connections.length}</span>
          <span className="kv-key">mvps</span>
          <span className="kv-val">{doc.mvps.length}</span>
          <span className="kv-key">tours</span>
          <span className="kv-val">{doc.tours?.length ?? 0}</span>
        </div>
        {doc.project.description !== undefined ? (
          <p className="inspector-text">{doc.project.description}</p>
        ) : null}
      </Section>

      <Section title="MVP timeline" defaultOpen>
        <div className="mvp-timeline">
          {sortedMvps.map((mvp) => {
            const active = currentMvp === mvp.id;
            return (
              <button
                key={mvp.id}
                type="button"
                className="mvp-timeline-row"
                data-active={active}
                onClick={() => {
                  setMvp(mvp.id);
                }}
              >
                <span className="mvp-timeline-dot" style={{ background: mvp.color }} />
                <span className="mvp-timeline-id">{mvp.id}</span>
                <span className="mvp-timeline-name">{mvp.name}</span>
                <span className="mvp-timeline-order">#{mvp.order}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Search">
        <SearchPanel doc={doc} />
      </Section>

      <Section title="Diagnostics">
        <DiagnosticsPanel doc={doc} />
      </Section>

      <Section title="Export">
        <ExportSection doc={doc} />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// SearchPanel — filter elements by name / id / tag / owner; click to select
// ---------------------------------------------------------------------------

function SearchPanel({ doc }: { doc: ProjectDocument }) {
  const [query, setQuery] = useState("");
  const select = useSelectionStore((s) => s.select);

  // No cap: every match is returned and the list virtualizes past the
  // threshold, so even a query that matches hundreds of elements stays cheap.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return [];
    return doc.elements.filter((e) => elementMatches(e, q));
  }, [doc, query]);

  const renderResult = (el: Element) => (
    <button
      type="button"
      className="inspector-search-result"
      onClick={() => {
        select(el.id);
      }}
    >
      <span className="inspector-search-result-name">{el.name}</span>
      <span className="inspector-search-result-meta">
        {el.type} · {el.id}
      </span>
    </button>
  );

  return (
    <>
      <input
        type="text"
        className="inspector-search-input"
        placeholder="Search by name, id, tag, owner…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        aria-label="Search elements"
      />
      {query.trim() === "" ? (
        <div className="inspector-empty-row">Type to search.</div>
      ) : results.length === 0 ? (
        <div className="inspector-empty-row">No matches.</div>
      ) : results.length > VIRTUALIZE_THRESHOLD ? (
        <VirtualList
          items={results}
          rowHeight={SEARCH_ROW_HEIGHT}
          maxHeight={SEARCH_VIEWPORT_HEIGHT}
          getKey={(el) => el.id}
          renderRow={renderResult}
          ariaLabel={`${String(results.length)} search results`}
        />
      ) : (
        <ul className="inspector-list">
          {results.map((el) => (
            <li key={el.id}>{renderResult(el)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function elementMatches(el: Element, q: string): boolean {
  if (el.name.toLowerCase().includes(q)) return true;
  if (el.id.toLowerCase().includes(q)) return true;
  if (el.type.toLowerCase().includes(q)) return true;
  const owner = el.properties.owner;
  if (typeof owner === "string" && owner.toLowerCase().includes(q)) return true;
  const tags = el.properties.tags;
  if (
    Array.isArray(tags) &&
    tags.some((t) => typeof t === "string" && t.toLowerCase().includes(q))
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// DiagnosticsPanel — structural problems that Zod can't catch
// ---------------------------------------------------------------------------
// Zod already rejects broken parent / endpoint refs at parse time, so we
// won't typically see those here. What we DO surface:
//   - Orphan elements (no incoming or outgoing connections, not a group, not
//     an actor)
//   - Layout overrides pointing to elements that no longer exist
//   - Connections introduced before either endpoint exists (lifecycle gap)

interface Diagnostic {
  severity: "warn" | "info";
  message: string;
  /** Optional element id the user can jump to. */
  elementId?: string;
}

function DiagnosticsPanel({ doc }: { doc: ProjectDocument }) {
  const select = useSelectionStore((s) => s.select);

  const diagnostics = useMemo(() => computeDiagnostics(doc), [doc]);

  if (diagnostics.length === 0) {
    return <div className="inspector-empty-row">No issues found.</div>;
  }

  return (
    <ul className="inspector-list">
      {diagnostics.map((d, i) => (
        <li key={i} className="inspector-diagnostic-row" data-severity={d.severity}>
          <span className="inspector-diagnostic-pip" />
          <span className="inspector-diagnostic-text">{d.message}</span>
          {d.elementId !== undefined ? (
            <button
              type="button"
              className="inspector-diagnostic-jump"
              onClick={() => {
                select(d.elementId ?? null);
              }}
            >
              jump →
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function computeDiagnostics(doc: ProjectDocument): Diagnostic[] {
  const out: Diagnostic[] = [];
  const elementIds = new Set(doc.elements.map((e) => e.id));
  const mvpOrder = new Map(doc.mvps.map((m) => [m.id, m.order]));

  // Build connection adjacency
  const connectedIds = new Set<string>();
  for (const c of doc.connections) {
    connectedIds.add(c.from);
    connectedIds.add(c.to);
  }

  // Orphans — exclude groups and actors (the latter often live at the edges)
  for (const el of doc.elements) {
    if (el.type === "group" || el.type === "actor") continue;
    if (!connectedIds.has(el.id)) {
      out.push({
        severity: "info",
        message: `${el.name} has no connections`,
        elementId: el.id,
      });
    }
  }

  // Layout overrides pointing to non-existent elements
  if (doc.layout !== undefined) {
    for (const [layerId, perLayer] of Object.entries(doc.layout)) {
      if (perLayer === undefined) continue;
      for (const id of Object.keys(perLayer)) {
        if (!elementIds.has(id)) {
          out.push({
            severity: "warn",
            message: `Stale layout override on ${layerId}: ${id} no longer exists`,
          });
        }
      }
    }
  }

  // Connection lifecycle gaps — connection introduced before its endpoints
  for (const c of doc.connections) {
    const cOrder = mvpOrder.get(c.lifecycle.introducedIn);
    if (cOrder === undefined) continue;
    const from = doc.elements.find((e) => e.id === c.from);
    const to = doc.elements.find((e) => e.id === c.to);
    if (from !== undefined) {
      const fromOrder = mvpOrder.get(from.lifecycle.introducedIn);
      if (fromOrder !== undefined && fromOrder > cOrder) {
        out.push({
          severity: "warn",
          message: `Connection ${c.id} appears in ${c.lifecycle.introducedIn} before ${from.name} exists`,
          elementId: from.id,
        });
      }
    }
    if (to !== undefined) {
      const toOrder = mvpOrder.get(to.lifecycle.introducedIn);
      if (toOrder !== undefined && toOrder > cOrder) {
        out.push({
          severity: "warn",
          message: `Connection ${c.id} appears in ${c.lifecycle.introducedIn} before ${to.name} exists`,
          elementId: to.id,
        });
      }
    }
  }

  return out;
}
