// ============================================================================
// EditableField — click-to-edit text primitive
// ============================================================================
// Shows `value` as static text. Clicking the value (or the dedicated edit
// button) enters edit mode: shows an input pre-filled with the current value.
//
//   - Enter (or input blur)     → commit via onChange
//   - Escape                    → cancel, revert to last committed value
//   - Empty + commit + allowEmpty=false → reverts (no destructive accidental clears)
//
// Optional `validate` rejects bad input with visible feedback instead of a
// silent revert: while the draft is invalid the input is flagged (red border +
// inline message) and commit is blocked, so the user learns *why* nothing
// happened. Escape still cancels.
//
// For multi-line content (description), pass `multiline`.
//
// Lives in core/state-agnostic territory: takes a value + callback, doesn't
// know about the doc store. The caller wires it to docStore mutations.
// ============================================================================

import { useEffect, useRef, useState } from "react";

import "@/features/inspector/sections/EditableField.css";

interface EditableFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  allowEmpty?: boolean;
  /** Visual variant — "default" is body text, "name" is the element name (larger). */
  variant?: "default" | "name";
  ariaLabel?: string;
  /**
   * Optional validator run against the current draft. Return an error message
   * to reject the input (blocks commit, shows inline feedback); return null
   * when the draft is acceptable.
   */
  validate?: (draft: string) => string | null;
}

export function EditableField({
  value,
  onChange,
  placeholder = "—",
  multiline = false,
  allowEmpty = false,
  variant = "default",
  ariaLabel,
  validate,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const validationError = editing ? (validate?.(draft) ?? null) : null;

  // Sync external value changes into the draft while not editing.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Autofocus on entering edit mode
  useEffect(() => {
    if (editing && inputRef.current !== null) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    // Reject invalid input rather than silently reverting — stay in edit mode
    // so the inline error stays visible and the user can fix it (or Escape).
    if ((validate?.(draft) ?? null) !== null) return;
    const trimmed = draft.trim();
    if (trimmed === "" && !allowEmpty) {
      setDraft(value); // revert
    } else if (trimmed !== value) {
      onChange(trimmed);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    } else if (e.key === "Enter" && multiline && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  };

  if (editing) {
    const invalid = validationError !== null;
    const field = multiline ? (
      <textarea
        ref={(el) => {
          inputRef.current = el;
        }}
        className="editable-field-input editable-field-input--multiline"
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        data-invalid={invalid || undefined}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    ) : (
      <input
        ref={(el) => {
          inputRef.current = el;
        }}
        type="text"
        className="editable-field-input"
        data-variant={variant}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        data-invalid={invalid || undefined}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    );

    // Always render the same wrapper so the input element is never remounted
    // when validity toggles — otherwise focus and cursor position are lost
    // mid-typing the moment the draft becomes (in)valid.
    return (
      <span className="editable-field-edit">
        {field}
        {invalid ? (
          <span className="editable-field-error" role="alert">
            {validationError}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="editable-field-display"
      data-variant={variant}
      data-empty={value === ""}
      onClick={() => {
        setEditing(true);
      }}
      aria-label={`Edit ${ariaLabel ?? ""}`.trim()}
    >
      {value === "" ? <span className="editable-field-placeholder">{placeholder}</span> : value}
    </button>
  );
}
