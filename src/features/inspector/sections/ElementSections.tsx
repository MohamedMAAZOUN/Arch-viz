// ============================================================================
// ElementSections — inspector sections when an element is selected
// ============================================================================
// Walks the resolved doc to find the element, its connections, and its
// lifecycle history. The Overview section now hosts inline-editable fields:
// name, description, owner. Edits flow through docStore mutations so they're
// captured by Y.UndoManager and reflected on the canvas immediately.
//
// Typed properties beyond the well-known set are still rendered as read-only
// JSON. Full schema-aware editing of nested properties (e.g. tech.language)
// is a v1.5 item.
// ============================================================================

import { docStore } from "@/core/doc/DocStore";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useResolvedDoc } from "@/core/doc/useResolvedDoc";
import { EditableField } from "@/features/inspector/sections/EditableField";
import { Section } from "@/features/inspector/sections/Section";

import type { Connection, Element } from "@/core/schema/schema";

interface ElementSectionsProps {
  elementId: string;
}

export default function ElementSections({ elementId }: ElementSectionsProps) {
  const doc = useDocSnapshot();
  const resolved = useResolvedDoc();

  if (doc === null) return null;

  const element = resolved?.elements.find((e) => e.id === elementId) ?? null;
  if (element === null) {
    return (
      <Section title="Overview" defaultOpen>
        <div className="inspector-empty-row">
          Element not visible at the current layer / MVP.
        </div>
      </Section>
    );
  }

  const incoming = doc.connections.filter((c) => c.to === elementId);
  const outgoing = doc.connections.filter((c) => c.from === elementId);

  return (
    <>
      <Section title="Overview" defaultOpen>
        <div className="kv-grid">
          <span className="kv-key">name</span>
          <span className="kv-val">
            <EditableField
              value={element.name}
              variant="name"
              ariaLabel="element name"
              onChange={(next) => {
                docStore.updateElementName(elementId, next);
              }}
            />
          </span>
          <span className="kv-key">type</span>
          <span className="kv-val">{element.type}</span>
          <span className="kv-key">id</span>
          <span className="kv-val kv-mono">{element.id}</span>
          {element.parent !== undefined ? (
            <>
              <span className="kv-key">parent</span>
              <span className="kv-val kv-mono">{element.parent}</span>
            </>
          ) : null}
          <span className="kv-key">min layer</span>
          <span className="kv-val">{element.minLayer}</span>
          <span className="kv-key">owner</span>
          <span className="kv-val">
            <EditableField
              value={asString(element.properties.owner)}
              placeholder="(unset)"
              allowEmpty
              ariaLabel="owner"
              onChange={(next) => {
                docStore.updateElementProperty(
                  elementId,
                  "owner",
                  next === "" ? null : next,
                );
              }}
            />
          </span>
        </div>

        <div className="inspector-edit-block">
          <div className="inspector-edit-label">description</div>
          <EditableField
            value={asString(element.properties.description)}
            placeholder="No description. Click to add one."
            multiline
            allowEmpty
            ariaLabel="description"
            onChange={(next) => {
              docStore.updateElementProperty(
                elementId,
                "description",
                next === "" ? null : next,
              );
            }}
          />
        </div>

        {element.properties.tags !== undefined && element.properties.tags.length > 0 ? (
          <div className="inspector-tags">
            {element.properties.tags.map((tag) => (
              <span key={tag} className="inspector-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Properties" defaultOpen>
        <PropertyGrid elementId={elementId} element={element} />
      </Section>

      <Section title="Dependencies" defaultOpen={incoming.length + outgoing.length > 0}>
        <ConnectionList kind="outbound" connections={outgoing} fromElement={elementId} />
        <ConnectionList kind="inbound" connections={incoming} fromElement={elementId} />
      </Section>

      <Section title="Live status">
        {element.dataSources !== undefined && element.dataSources.length > 0 ? (
          <ul className="inspector-list">
            {element.dataSources.map((ds, i) => (
              <li key={i} className="inspector-list-row">
                <span className="inspector-list-key">{ds.kind}</span>
                <span className="inspector-list-val">→ {ds.binding}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="inspector-empty-row">No data sources configured.</div>
        )}
      </Section>

      <Section title="History">
        <div className="kv-grid">
          <span className="kv-key">introduced</span>
          <span className="kv-val kv-mono">{element.lifecycle.introducedIn}</span>
          {element.lifecycle.removedIn !== undefined ? (
            <>
              <span className="kv-key">removed</span>
              <span className="kv-val kv-mono">{element.lifecycle.removedIn}</span>
            </>
          ) : null}
        </div>
        {element.lifecycle.modifiedIn !== undefined ? (
          <div className="inspector-history">
            {Object.entries(element.lifecycle.modifiedIn).map(([mvpId, patch]) => (
              <div key={mvpId} className="inspector-history-row">
                <span className="inspector-history-mvp">{mvpId}</span>
                <span className="inspector-history-detail">
                  {Object.keys(patch.properties).length} property change
                  {Object.keys(patch.properties).length === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Documentation">
        <div className="inspector-empty-row">Markdown notes, links, attachments. (Coming soon.)</div>
      </Section>

      <Section title="Annotations">
        <div className="inspector-empty-row">Comments. (Coming soon.)</div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// PropertyGrid — type-specific properties (editable scalars)
// ---------------------------------------------------------------------------
// Scalar values (string, number, boolean) are inline-editable via the same
// EditableField primitive as the Overview section. Nested objects render as
// a sub-group; their scalar leaves are editable too via the path-aware
// mutation in DocStore.
//
// Arrays and complex values stay read-only — editing them requires structured
// UI we'll add in v1.5.

const OVERVIEW_KEYS = new Set(["description", "owner", "tags", "_layerVisibility"]);

function PropertyGrid({ elementId, element }: { elementId: string; element: Element }) {
  const entries = Object.entries(element.properties).filter(([key]) => !OVERVIEW_KEYS.has(key));

  if (entries.length === 0) {
    return <div className="inspector-empty-row">No type-specific properties.</div>;
  }

  return (
    <div className="kv-grid">
      {entries.flatMap(([key, value]) => renderProperty(elementId, [key], key, value))}
    </div>
  );
}

function renderProperty(
  elementId: string,
  path: readonly string[],
  label: string,
  value: unknown,
): React.ReactNode[] {
  // Nested objects get a subheader + indented children
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const children = Object.entries(value as Record<string, unknown>);
    return [
      <span key={path.join(".") + ":hdr"} className="kv-subheader">
        {label}
      </span>,
      <span key={path.join(".") + ":pad"} />,
      ...children.flatMap(([k, v]) => renderProperty(elementId, [...path, k], k, v)),
    ];
  }

  const pathKey = path.join(".");
  return [
    <span key={pathKey + ".k"} className={path.length > 1 ? "kv-key kv-indent" : "kv-key"}>
      {label}
    </span>,
    <span key={pathKey + ".v"} className="kv-val">
      {renderValueField(elementId, path, value)}
    </span>,
  ];
}

/** Render the actual editor (or read-only display) for a single value. */
function renderValueField(
  elementId: string,
  path: readonly string[],
  value: unknown,
): React.ReactNode {
  // Arrays render read-only — structured editing comes in v1.5.
  if (Array.isArray(value)) {
    return <span>{formatScalar(value)}</span>;
  }

  // Booleans get a checkbox; far better UX than typing "true"/"false".
  if (typeof value === "boolean") {
    return (
      <input
        type="checkbox"
        className="kv-checkbox"
        checked={value}
        aria-label={path.join(".")}
        onChange={(e) => {
          docStore.updateElementPropertyPath(elementId, path, e.target.checked);
        }}
      />
    );
  }

  // Numbers stay strings in the input; we parse on commit.
  if (typeof value === "number") {
    return (
      <EditableField
        value={String(value)}
        ariaLabel={path.join(".")}
        onChange={(next) => {
          const parsed = Number(next);
          if (!Number.isFinite(parsed)) return; // ignore invalid; field reverts
          docStore.updateElementPropertyPath(elementId, path, parsed);
        }}
      />
    );
  }

  // Everything else (string, undefined, null): edit as text.
  return (
    <EditableField
      value={asString(value)}
      placeholder="(unset)"
      allowEmpty
      ariaLabel={path.join(".")}
      onChange={(next) => {
        docStore.updateElementPropertyPath(elementId, path, next === "" ? null : next);
      }}
    />
  );
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatScalar).join(", ");
  return JSON.stringify(value);
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // For arrays and objects, JSON.stringify gives us something useful instead
  // of "[object Object]". Edit fields with object values are read-only at the
  // moment; we still need a string to put in the input.
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// ConnectionList — inbound or outbound dependencies
// ---------------------------------------------------------------------------

function ConnectionList({
  kind,
  connections,
  fromElement,
}: {
  kind: "inbound" | "outbound";
  connections: readonly Connection[];
  fromElement: string;
}) {
  if (connections.length === 0) return null;
  return (
    <div className="inspector-conn-group">
      <div className="inspector-conn-heading">{kind}</div>
      <ul className="inspector-list">
        {connections.map((c) => {
          const other = kind === "outbound" ? c.to : c.from;
          if (other === fromElement) return null;
          return (
            <li key={c.id} className="inspector-list-row">
              <span className="inspector-conn-arrow">{kind === "outbound" ? "→" : "←"}</span>
              <span className="inspector-list-key kv-mono">{other}</span>
              <span className="inspector-list-val">
                {c.type}
                {c.protocol !== undefined ? ` · ${c.protocol}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
