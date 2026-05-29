// ============================================================================
// CustomNode — React Flow node component, themed via design tokens
// ============================================================================
// One component for all element types. Type variation is conveyed via:
//   - a small glyph (top-left)
//   - the type label (top-right)
//   - border style (external → dashed; group → thicker)
// ============================================================================

 
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

import type { Element, ElementType } from "@/core/schema/schema";

import "@/features/canvas/nodes/CustomNode.css";

type CustomNodeType = Node<{ element: Element }, "custom">;

export function CustomNode({ data, selected }: NodeProps<CustomNodeType>) {
  const { element } = data;
  const tone = element.style?.tone ?? "neutral";
  const isExternal = element.type === "external";
  const isGroup = element.type === "group";

  return (
    <div
      className="cnode"
      data-type={element.type}
      data-tone={tone}
      data-selected={selected}
      data-external={isExternal}
      data-group={isGroup}
    >
      <Handle type="target" position={Position.Top} className="cnode-handle" />

      <div className="cnode-row cnode-row--top">
        <Glyph type={element.type} />
        <span className="cnode-type">{element.type}</span>
      </div>

      <div className="cnode-name">{element.name}</div>

      <div className="cnode-row cnode-row--bottom">
        {element.properties.owner !== undefined ? (
          <span className="cnode-meta">{element.properties.owner}</span>
        ) : null}
        <span className="cnode-mvp">{element.lifecycle.introducedIn}</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="cnode-handle" />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Glyph — a tiny inline SVG per element type. No external icon dep.
// ----------------------------------------------------------------------------

function Glyph({ type }: { type: ElementType }) {
  return (
    <span className="cnode-glyph" aria-hidden>
      {(() => {
        switch (type) {
          case "service":
            return (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="12" height="10" rx="1.5" />
                <path d="M5 7h6M5 10h4" strokeLinecap="round" />
              </svg>
            );
          case "database":
            return (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <ellipse cx="8" cy="4" rx="5" ry="1.8" />
                <path d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4" />
                <path d="M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" />
              </svg>
            );
          case "queue":
            return (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="5" width="3" height="6" rx="0.5" />
                <rect x="6.5" y="5" width="3" height="6" rx="0.5" />
                <rect x="11" y="5" width="3" height="6" rx="0.5" />
              </svg>
            );
          case "frontend":
            return (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="12" height="10" rx="1" />
                <path d="M2 6h12" />
                <circle cx="4" cy="4.5" r="0.4" fill="currentColor" />
                <circle cx="5.5" cy="4.5" r="0.4" fill="currentColor" />
              </svg>
            );
          case "external":
            return (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="5.5" />
                <path d="M2.5 8h11M8 2.5c2 1.5 2 9.5 0 11M8 2.5c-2 1.5-2 9.5 0 11" />
              </svg>
            );
          case "actor":
            return (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="5" r="2.5" />
                <path d="M3 14c0-3 2.2-5 5-5s5 2 5 5" strokeLinecap="round" />
              </svg>
            );
          case "group":
            return (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="12" height="12" rx="1.5" strokeDasharray="2 2" />
                <rect x="4" y="4" width="3" height="3" rx="0.5" />
                <rect x="9" y="4" width="3" height="3" rx="0.5" />
                <rect x="4" y="9" width="3" height="3" rx="0.5" />
              </svg>
            );
        }
      })()}
    </span>
  );
}
