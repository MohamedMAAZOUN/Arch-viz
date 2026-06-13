// ============================================================================
// DocumentationSection — markdown notes on an element (view + edit)
// ============================================================================
// Renders the element's `documentation` as formatted Markdown, with a toggle
// into a raw textarea for editing. Edits flow through docStore so they undo as
// one step and persist with the document.
// ============================================================================

import { useEffect, useState } from "react";

import { docStore } from "@/core/doc/DocStore";
import { Markdown } from "@/features/inspector/sections/Markdown";

import "@/features/inspector/sections/DocsAnnotations.css";

export function DocumentationSection({
  elementId,
  documentation,
}: {
  elementId: string;
  documentation: string | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(documentation ?? "");

  // Reset the draft when switching elements or when an external edit lands.
  useEffect(() => {
    if (!editing) setDraft(documentation ?? "");
  }, [documentation, editing, elementId]);

  const save = () => {
    const trimmed = draft.trim();
    docStore.updateElementDocumentation(elementId, trimmed === "" ? null : trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="docs-editor">
        <textarea
          className="docs-textarea"
          value={draft}
          autoFocus
          placeholder="Write Markdown… (# headings, **bold**, lists, `code`, links)"
          aria-label="element documentation"
          onChange={(e) => {
            setDraft(e.target.value);
          }}
        />
        <div className="docs-editor-actions">
          <button type="button" className="docs-btn docs-btn--primary" onClick={save}>
            Save
          </button>
          <button
            type="button"
            className="docs-btn"
            onClick={() => {
              setDraft(documentation ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="docs-view">
      {documentation !== undefined && documentation.trim() !== "" ? (
        <Markdown source={documentation} />
      ) : (
        <div className="inspector-empty-row">No documentation yet.</div>
      )}
      <button
        type="button"
        className="docs-btn"
        onClick={() => {
          setEditing(true);
        }}
      >
        {documentation !== undefined && documentation.trim() !== "" ? "Edit" : "Add documentation"}
      </button>
    </div>
  );
}
