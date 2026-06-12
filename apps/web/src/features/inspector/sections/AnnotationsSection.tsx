// ============================================================================
// AnnotationsSection — freeform notes on an element (single-user, v1)
// ============================================================================
// Add / remove plain-text notes. Each note carries an id + timestamp so the
// collaborative version (multiplayer epic) is an additive upgrade, not a
// migration. Mutations flow through docStore (undo + persistence for free).
// ============================================================================

import { useState } from "react";

import { docStore } from "@/core/doc/DocStore";
import { createId } from "@/lib/id";

import type { Annotation } from "@arch-vis/schema";

import "@/features/inspector/sections/DocsAnnotations.css";

export function AnnotationsSection({
  elementId,
  annotations,
}: {
  elementId: string;
  annotations: readonly Annotation[] | undefined;
}) {
  const [draft, setDraft] = useState("");
  const notes = annotations ?? [];

  const add = () => {
    const body = draft.trim();
    if (body === "") return;
    docStore.addAnnotation(elementId, {
      id: createId("note"),
      body,
      createdAt: new Date().toISOString(),
    });
    setDraft("");
  };

  return (
    <div className="annotations">
      {notes.length === 0 ? (
        <div className="inspector-empty-row">No notes yet.</div>
      ) : (
        <ul className="annotations-list">
          {notes.map((note) => (
            <li key={note.id} className="annotation">
              <div className="annotation-body">{note.body}</div>
              <div className="annotation-meta">
                {note.author !== undefined ? <span>{note.author} · </span> : null}
                <span>{formatTimestamp(note.createdAt)}</span>
              </div>
              <button
                type="button"
                className="annotation-remove"
                aria-label="Remove note"
                title="Remove note"
                onClick={() => {
                  docStore.removeAnnotation(elementId, note.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="docs-editor">
        <textarea
          className="docs-textarea docs-textarea--compact"
          value={draft}
          placeholder="Add a note…"
          aria-label="new annotation"
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              add();
            }
          }}
        />
        <div className="docs-editor-actions">
          <button
            type="button"
            className="docs-btn docs-btn--primary"
            disabled={draft.trim() === ""}
            onClick={add}
          >
            Add note
          </button>
        </div>
      </div>
    </div>
  );
}

/** Format an ISO timestamp for display. Reads the stored value only — never
 *  `Date.now()` — so it stays safe inside the render path. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
