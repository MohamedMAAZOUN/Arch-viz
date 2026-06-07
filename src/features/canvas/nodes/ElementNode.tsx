// ============================================================================
// ElementNode — generic React Flow node component (leaf / collapsed container)
// ============================================================================
// One component handles all seven element types — branches on `element.type`
// for the icon and any per-type visual cues. Renders both true leaf nodes and
// collapsed containers (a collapsed group still shows an expand chevron so the
// user can open it in place).
//
// Visual layers:
//   - Tone bar (left edge) → semantic state (critical / warning / etc.)
//   - MVP lifecycle badge → the MVP this element was introduced in
//   - Type badge → service / database / queue / ...
//   - Expand chevron → when the node has hidden children (collapsed)
//   - Selection glow → from the design system
//
// This file lives in features/canvas/nodes/ which is ESLint-exempt from the
// "no @xyflow/react imports outside Canvas.tsx" rule.
// ============================================================================

import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";

import { durationSec, ease } from "@/design-system/tokens";
import {
  ElementTypeBadge,
  ExpandToggle,
  LiveIndicator,
  MvpLifecycleBadge,
} from "@/features/canvas/nodes/NodeParts";

import type { Element } from "@/core/schema/schema";
import type { ContainmentData } from "@/features/canvas/nodes/NodeParts";
import type { Node, NodeProps } from "@xyflow/react";
import type { MotionStyle } from "motion/react";

import "@/features/canvas/nodes/ElementNode.css";

// React Flow's Node<T> constrains T to Record<string, unknown>. We satisfy
// that constraint while keeping our fields strongly typed.
export interface ElementNodeData extends Record<string, unknown>, ContainmentData {
  element: Element;
  /** Color of the MVP this element was introduced in. Null if not derivable. */
  introducedColor: string | null;
  /** Id of the introducing MVP — shown next to the color dot. */
  introducedIn: string;
  /** Faded during a tour step that highlights other nodes. */
  dimmed: boolean;
  /** Overlay mode — tint the node by its introducing MVP color. */
  overlay: boolean;
}
export type ElementNodeType = Node<ElementNodeData, "element">;

export function ElementNode({ data, selected }: NodeProps<ElementNodeType>) {
  const { element, introducedColor, introducedIn, canExpand, isExpanded, dimmed, overlay } = data;
  const tone = element.style?.tone ?? "neutral";
  const tinted = overlay && introducedColor !== null;

  return (
    <>
      <Handle type="target" position={Position.Top} className="element-node-handle" />

      <motion.div
        className="element-node"
        data-tone={tone}
        data-type={element.type}
        data-selected={selected}
        data-collapsed={canExpand ? true : undefined}
        data-dimmed={dimmed ? true : undefined}
        data-overlay={tinted ? true : undefined}
        // Cast: `--overlay-tint` is a CSS custom property, which MotionStyle's
        // keyed type doesn't model. The value is a plain color string.
        style={(tinted ? { ["--overlay-tint"]: introducedColor } : {}) as MotionStyle}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: durationSec.slow, ease: ease.out }}
      >
        <div className="element-node-row">
          <ElementTypeBadge type={element.type} />
          <div className="element-node-name" title={element.name}>
            {element.name}
          </div>
          {introducedColor !== null ? (
            <MvpLifecycleBadge color={introducedColor} mvpId={introducedIn} />
          ) : null}
          <LiveIndicator element={element} />
          {canExpand ? <ExpandToggle elementId={element.id} isExpanded={isExpanded} /> : null}
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
