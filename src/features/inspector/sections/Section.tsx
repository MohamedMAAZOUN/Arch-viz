// ============================================================================
// Section — collapsible primitive for the Inspector
// ============================================================================
// Tiny presentational component; state lives in the parent.
// ============================================================================

import { useState } from "react";

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Section({ title, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="inspector-section" data-open={open}>
      <button
        type="button"
        className="inspector-section-trigger"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
        }}
      >
        <span>{title}</span>
        <Chevron />
      </button>
      {open ? <div className="inspector-section-body">{children}</div> : null}
    </div>
  );
}

function Chevron() {
  return (
    <svg
      className="inspector-section-chevron"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
