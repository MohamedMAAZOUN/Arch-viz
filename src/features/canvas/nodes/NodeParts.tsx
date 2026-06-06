// ============================================================================
// NodeParts — small presentational pieces shared by ElementNode and GroupNode
// ============================================================================
// Extracted so the leaf node and the container node render an identical type
// badge, MVP badge, glyph, and expand/collapse chevron. Lives in
// features/canvas/nodes/ which is ESLint-exempt from the no-@xyflow rule, but
// these parts don't import @xyflow at all — they're pure presentation.
// ============================================================================

import { useLiveData } from "@/core/live/useLiveData";
import { useViewStore } from "@/core/state/viewStore";

import type { Element, ElementType } from "@/core/schema/schema";

// ---------------------------------------------------------------------------
// Containment data carried on every node so the chevron knows what to do.
// ---------------------------------------------------------------------------

export interface ContainmentData {
  /** Has children that are gated-in at this view → show a chevron. */
  canExpand: boolean;
  /** Effective expand state (default merged with the user's override). */
  isExpanded: boolean;
}

// ---------------------------------------------------------------------------
// ExpandToggle — chevron that flips a node's expand/collapse override.
// ---------------------------------------------------------------------------

export function ExpandToggle({
  elementId,
  isExpanded,
}: {
  elementId: string;
  isExpanded: boolean;
}) {
  const setGroupExpansion = useViewStore((s) => s.setGroupExpansion);

  // Stop propagation so toggling never starts a drag or selects the node.
  const onClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setGroupExpansion(elementId, !isExpanded);
  };

  return (
    <button
      type="button"
      className="node-expand-toggle"
      data-expanded={isExpanded}
      aria-label={isExpanded ? "Collapse" : "Expand"}
      aria-expanded={isExpanded}
      onClick={onClick}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
        <path
          d="M8 10l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// LiveIndicator — compact live-data status dot + first value chip on a node.
// ---------------------------------------------------------------------------
// Subscribes (via useLiveData) to the element's http data sources and renders a
// status dot and, when present, the first metric/badge/label value. Renders
// nothing when the element has no pollable sources or live data is opted out
// (grafana/jira sources are link buttons in the inspector, never shown here).

export function LiveIndicator({ element }: { element: Element }) {
  const live = useLiveData(element);
  if (live.state === "idle" || live.state === "disabled") return null;

  const firstChip = live.chips[0];
  const title = liveTitle(live.state, live.error);

  return (
    <span className="live-indicator" data-state={live.state} title={title}>
      <span className="live-dot" data-status={live.status ?? "unknown"} />
      {firstChip !== undefined ? <span className="live-chip">{firstChip.text}</span> : null}
    </span>
  );
}

function liveTitle(state: string, error: string | null): string {
  switch (state) {
    case "loading":
      return "Live data: loading…";
    case "ok":
      return "Live data: connected";
    case "stale":
      return `Live data: stale${error !== null ? ` — ${error}` : ""}`;
    case "error":
      return `Live data: unavailable${error !== null ? ` — ${error}` : ""}`;
    default:
      return "Live data";
  }
}

// ---------------------------------------------------------------------------
// MvpLifecycleBadge — color dot identifying the MVP that introduced the node.
// ---------------------------------------------------------------------------

export function MvpLifecycleBadge({ color, mvpId }: { color: string; mvpId: string }) {
  return (
    <span
      className="element-node-mvp-badge"
      title={`Introduced in ${mvpId}`}
      style={
        {
          ["--mvp-color" as string]: color,
        } as React.CSSProperties
      }
    >
      <span className="element-node-mvp-dot" />
      <span className="element-node-mvp-label">{mvpId}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// ElementTypeBadge — small label + glyph identifying the element's type.
// ---------------------------------------------------------------------------

export function ElementTypeBadge({ type }: { type: ElementType }) {
  return (
    <span className="element-node-type-badge" data-type={type}>
      <ElementGlyph type={type} />
      <span className="element-node-type-label">{type}</span>
    </span>
  );
}

export function ElementGlyph({ type }: { type: ElementType }) {
  const stroke = "currentColor";
  const sw = 1.75;
  const c = "round";

  switch (type) {
    case "service":
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
          <path
            d="M4 7h16v4H4zM4 13h16v4H4z"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin={c}
          />
          <circle cx="7" cy="9" r="0.9" fill={stroke} />
          <circle cx="7" cy="15" r="0.9" fill={stroke} />
        </svg>
      );
    case "database":
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
          <ellipse cx="12" cy="5.5" rx="7" ry="2.2" fill="none" stroke={stroke} strokeWidth={sw} />
          <path
            d="M5 5.5v13c0 1.2 3.1 2.2 7 2.2s7-1 7-2.2v-13"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap={c}
          />
          <path
            d="M5 12c0 1.2 3.1 2.2 7 2.2s7-1 7-2.2"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />
        </svg>
      );
    case "queue":
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
          <rect
            x="3"
            y="9"
            width="4"
            height="6"
            rx="0.5"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />
          <rect
            x="10"
            y="9"
            width="4"
            height="6"
            rx="0.5"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />
          <rect
            x="17"
            y="9"
            width="4"
            height="6"
            rx="0.5"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />
        </svg>
      );
    case "frontend":
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
          <rect
            x="3"
            y="4"
            width="18"
            height="13"
            rx="1.5"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />
          <path d="M9 20h6M12 17v3" stroke={stroke} strokeWidth={sw} strokeLinecap={c} />
        </svg>
      );
    case "external":
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
          <circle
            cx="12"
            cy="12"
            r="8"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeDasharray="2 2"
          />
          <path
            d="M4 12h16M12 4c2.5 2.6 2.5 12.4 0 16M12 4c-2.5 2.6-2.5 12.4 0 16"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />
        </svg>
      );
    case "actor":
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
          <circle cx="12" cy="7" r="3" fill="none" stroke={stroke} strokeWidth={sw} />
          <path
            d="M5 20c0-4 3.1-7 7-7s7 3 7 7"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap={c}
          />
        </svg>
      );
    case "group":
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
          <rect
            x="3"
            y="6"
            width="18"
            height="14"
            rx="1.5"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeDasharray="3 2"
          />
          <path d="M3 10h18" stroke={stroke} strokeWidth={sw} />
        </svg>
      );
  }
}
