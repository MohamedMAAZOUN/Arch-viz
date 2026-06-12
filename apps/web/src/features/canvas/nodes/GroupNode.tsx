// ============================================================================
// GroupNode — React Flow container node (an expanded element with children)
// ============================================================================
// Rendered for any element that currently contains visible children (a domain
// group, or a service with nested data, etc.). It is a framed box with a
// header (type badge + name + MVP badge + collapse chevron); the children are
// separate React Flow nodes positioned inside it via parentId/extent.
//
// The box fills the size React Flow assigns from the layout (set as inline
// width/height in Canvas.tsx). Lives in the ESLint-exempt nodes/ folder.
// ============================================================================

import { Handle, Position } from "@xyflow/react";

import {
  ElementTypeBadge,
  ExpandToggle,
  LiveIndicator,
  MvpLifecycleBadge,
} from "@/features/canvas/nodes/NodeParts";

import type { ContainmentData } from "@/features/canvas/nodes/NodeParts";
import type { Element } from "@arch-vis/schema";
import type { Node, NodeProps } from "@xyflow/react";

import "@/features/canvas/nodes/GroupNode.css";

export interface GroupNodeData extends Record<string, unknown>, ContainmentData {
  element: Element;
  introducedColor: string | null;
  introducedIn: string;
  /** Faded during a tour step that highlights other nodes. */
  dimmed: boolean;
  /** Overlay mode — tint the container by its introducing MVP color. */
  overlay: boolean;
}
export type GroupNodeType = Node<GroupNodeData, "group">;

export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  const { element, introducedColor, introducedIn, isExpanded, dimmed, overlay } = data;
  const tone = element.style?.tone ?? "neutral";
  const tinted = overlay && introducedColor !== null;

  return (
    <>
      <Handle type="target" position={Position.Top} className="element-node-handle" />

      <div
        className="group-node"
        data-tone={tone}
        data-type={element.type}
        data-selected={selected}
        data-dimmed={dimmed ? true : undefined}
        data-overlay={tinted ? true : undefined}
        style={
          tinted
            ? ({ ["--overlay-tint" as string]: introducedColor } as React.CSSProperties)
            : undefined
        }
      >
        <div className="group-node-header">
          <ElementTypeBadge type={element.type} />
          <div className="group-node-name" title={element.name}>
            {element.name}
          </div>
          {introducedColor !== null ? (
            <MvpLifecycleBadge color={introducedColor} mvpId={introducedIn} />
          ) : null}
          <LiveIndicator element={element} />
          <ExpandToggle elementId={element.id} isExpanded={isExpanded} />
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="element-node-handle" />
    </>
  );
}
