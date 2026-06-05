// ============================================================================
// Section — collapsible primitive for the Inspector
// ============================================================================
// Open/collapse state is persisted per section title (inspectorPrefsStore) so
// it survives reloads and selection changes; `defaultOpen` is only the initial
// value used until the user touches the section.
// ============================================================================

import { useInspectorPrefsStore } from "@/core/state/inspectorPrefsStore";

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Section({ title, defaultOpen = false, children }: SectionProps) {
  const stored = useInspectorPrefsStore((s) => s.sectionOpen[title]);
  const setSectionOpen = useInspectorPrefsStore((s) => s.setSectionOpen);
  const open = stored ?? defaultOpen;

  return (
    <div className="inspector-section" data-open={open}>
      <button
        type="button"
        className="inspector-section-trigger"
        aria-expanded={open}
        onClick={() => {
          setSectionOpen(title, !open);
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
