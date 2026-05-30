// ============================================================================
// ElementNode — generic React Flow node component
// ============================================================================
// One component handles all seven element types — branches on `element.type`
// for the icon and any per-type visual cues.
//
// Visual layers:
//   - Tone bar (left edge) → semantic state (critical / warning / etc.)
//   - MVP lifecycle badge → the MVP this element was introduced in
//   - Type badge → service / database / queue / ...
//   - Selection glow → from the design system
//
// This file lives in features/canvas/nodes/ which is ESLint-exempt from the
// "no @xyflow/react imports outside Canvas.tsx" rule.
// ============================================================================

import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";

import { duration, ease } from "@/design-system/tokens";

import type { Element, ElementType } from "@/core/schema/schema";
import type { Node, NodeProps } from "@xyflow/react";

import "@/features/canvas/nodes/ElementNode.css";

// React Flow's Node<T> constrains T to Record<string, unknown>. We satisfy
// that constraint while keeping our fields strongly typed.
export interface ElementNodeData extends Record<string, unknown> {
  element: Element;
  /** Color of the MVP this element was introduced in. Null if not derivable. */
  introducedColor: string | null;
  /** Id of the introducing MVP — shown next to the color dot. */
  introducedIn: string;
}
export type ElementNodeType = Node<ElementNodeData, "element">;

export function ElementNode({ data, selected }: NodeProps<ElementNodeType>) {
  const { element, introducedColor, introducedIn } = data;
  const tone = element.style?.tone ?? "neutral";

  return (
    <>
      <Handle type="target" position={Position.Top} className="element-node-handle" />

      <motion.div
        className="element-node"
        data-tone={tone}
        data-type={element.type}
        data-selected={selected}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: duration.slow / 1000, ease: ease.out }}
        layout="position"
      >
        <div className="element-node-row">
          <ElementTypeBadge type={element.type} />
          <div className="element-node-name" title={element.name}>
            {element.name}
          </div>
          {introducedColor !== null ? (
            <MvpLifecycleBadge color={introducedColor} mvpId={introducedIn} />
          ) : null}
        </div>

        {element.properties.description !== undefined ? (
          <div className="element-node-desc" title={element.properties.description}>
            {element.properties.description}
          </div>
        ) : null}

        {element.properties.tags !== undefined && element.properties.tags.length > 0 ? (
          <div className="element-node-tags">
            {element.properties.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="element-node-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </motion.div>

      <Handle type="source" position={Position.Bottom} className="element-node-handle" />
    </>
  );
}

// ---------------------------------------------------------------------------
// MvpLifecycleBadge — small color dot identifying the MVP that introduced
//                     this element. The signature color comes from the schema.
// ---------------------------------------------------------------------------

function MvpLifecycleBadge({ color, mvpId }: { color: string; mvpId: string }) {
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
// ElementTypeBadge — small label + glyph identifying the element's type
// ---------------------------------------------------------------------------

function ElementTypeBadge({ type }: { type: ElementType }) {
  return (
    <span className="element-node-type-badge" data-type={type}>
      <ElementGlyph type={type} />
      <span className="element-node-type-label">{type}</span>
    </span>
  );
}

function ElementGlyph({ type }: { type: ElementType }) {
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
