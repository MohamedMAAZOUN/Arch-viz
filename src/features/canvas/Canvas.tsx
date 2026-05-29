// ============================================================================
// Canvas — wrapper around React Flow
// ============================================================================
// THE ONLY FILE in the codebase that imports @xyflow/react directly (along
// with the node components in ./nodes/). Application code renders <Canvas />
// and never sees xyflow types.
//
// Data flow:
//   doc → useResolvedDoc → (elements + connections at layer/mvp)
//   doc → useLayoutedGraph → positions (ELK auto-layout per layer)
//   selection ↔ selectionStore
//
// Critical pattern: nodes/edges are kept in React Flow's own state via
// useNodesState/useEdgesState. Without onNodesChange wired up, React Flow
// drops the user's click-to-select change and selection silently fails.
// We sync FROM the doc (when it changes) and TO our selection store
// (via onSelectionChange).
// ============================================================================

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useEffect, useMemo, useRef } from "react";

import { docStore } from "@/core/doc/DocStore";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useResolvedDoc } from "@/core/doc/useResolvedDoc";
import { assertNever } from "@/core/errors";
import { useSelectionStore } from "@/core/state/selectionStore";
import { useViewStore } from "@/core/state/viewStore";
import { LoadExampleButton } from "@/features/canvas/LoadExampleButton";
import { ElementNode } from "@/features/canvas/nodes/ElementNode";
import { useLayoutedGraph } from "@/features/canvas/useLayoutedGraph";

import type { Connection, ConnectionType, ProjectDocument } from "@/core/schema/schema";
import type { ElementNodeType } from "@/features/canvas/nodes/ElementNode";
import type { Edge, OnSelectionChangeFunc, ReactFlowInstance } from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "@/features/canvas/Canvas.css";

const nodeTypes = { element: ElementNode };

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

function CanvasInner() {
  const doc = useDocSnapshot();
  const resolved = useResolvedDoc();
  const currentLayer = useViewStore((s) => s.currentLayer);
  const positions = useLayoutedGraph(doc, currentLayer);

  const select = useSelectionStore((s) => s.select);

  // Build a fast lookup of MVP id → signature color (passed into every node)
  const mvpColors = useMemo(() => buildMvpColorMap(doc), [doc]);

  // Derive the "next" set of nodes from the doc.
  const derivedNodes = useMemo<ElementNodeType[]>(() => {
    if (resolved === null) return [];
    return resolved.elements
      .map((element): ElementNodeType | null => {
        const pos = positions.get(element.id);
        if (pos === undefined) return null;
        return {
          id: element.id,
          type: "element",
          position: pos,
          data: {
            element,
            introducedColor: mvpColors.get(element.lifecycle.introducedIn) ?? null,
            introducedIn: element.lifecycle.introducedIn,
          },
        };
      })
      .filter((n): n is ElementNodeType => n !== null);
  }, [resolved, positions, mvpColors]);

  const derivedEdges = useMemo<Edge[]>(() => {
    if (resolved === null) return [];
    return resolved.connections.map((c): Edge => edgeFromConnection(c));
  }, [resolved]);

  // React Flow state — owns selection internally. Without these handlers,
  // single-click selection silently fails (the change event is dropped).
  const [nodes, setNodes, onNodesChange] = useNodesState<ElementNodeType>(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(derivedEdges);

  // Sync FROM doc → React Flow state, preserving selection across re-derives.
  useEffect(() => {
    setNodes((prev) => {
      const selectedSet = new Set(
        prev.filter((n) => n.selected === true).map((n) => n.id),
      );
      return derivedNodes.map((n) =>
        selectedSet.has(n.id) ? { ...n, selected: true } : n,
      );
    });
  }, [derivedNodes, setNodes]);

  useEffect(() => {
    setEdges(derivedEdges);
  }, [derivedEdges, setEdges]);

  // Sync TO selection store (so the inspector can react).
  const onSelectionChange: OnSelectionChangeFunc = ({ nodes: selectedNodes }) => {
    select(selectedNodes[0]?.id ?? null);
  };

  // Persist drag-to-position into the doc as a layer-scoped override.
  // Per the schema: positions are stored per LAYER (not per MVP), so the
  // override lives at doc.layout[currentLayer][nodeId].
  const onNodeDragStop = (_event: React.MouseEvent, node: ElementNodeType) => {
    docStore.setElementLayoutOverride(currentLayer, node.id, node.position);
  };

  // Fit view once when the first batch of positions lands for a project.
  // Re-arm only when the project ID changes (a different project was loaded),
  // NOT on every doc mutation — otherwise any rename/edit resets the viewport.
  const flowRef = useRef<ReactFlowInstance<ElementNodeType> | null>(null);
  const fitOnFirstLayout = useRef(true);
  const projectId = doc?.project.id ?? null;

  useEffect(() => {
    if (fitOnFirstLayout.current && nodes.length > 0 && flowRef.current !== null) {
      void flowRef.current.fitView({ duration: 400, padding: 0.2 });
      fitOnFirstLayout.current = false;
    }
  }, [nodes.length]);

  useEffect(() => {
    fitOnFirstLayout.current = true;
  }, [projectId]);

  return (
    <div className="canvas">
      <ReactFlow<ElementNodeType, Edge>
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2.5}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        selectionOnDrag={false}
        panOnDrag
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>

      {doc === null ? <CanvasEmptyState /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MVP color lookup
// ---------------------------------------------------------------------------

function buildMvpColorMap(doc: ProjectDocument | null): ReadonlyMap<string, string> {
  if (doc === null) return new Map();
  return new Map(doc.mvps.map((m) => [m.id, m.color]));
}

// ---------------------------------------------------------------------------
// Edge styling — type-aware, exhaustive switch so adding a new ConnectionType
// causes a compile error rather than a silent styling gap.
// ---------------------------------------------------------------------------

function edgeFromConnection(c: Connection): Edge {
  return {
    id: c.id,
    source: c.from,
    target: c.to,
    type: "smoothstep",
    animated: isAnimatedEdge(c.type),
    label: c.protocol,
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 4,
    style: {
      stroke: edgeStroke(c.type),
      strokeWidth: 1.5,
    },
  };
}

function isAnimatedEdge(type: ConnectionType): boolean {
  switch (type) {
    case "sync":
      return false;
    case "async":
      return true;
    case "event":
      return true;
    case "data":
      return false;
    default:
      return assertNever(type);
  }
}

function edgeStroke(type: ConnectionType): string {
  switch (type) {
    case "sync":
      return "var(--color-fg-faint)";
    case "async":
      return "var(--color-fg-faint)";
    case "event":
      return "var(--color-fg-faint)";
    case "data":
      return "var(--color-tone-success)";
    default:
      return assertNever(type);
  }
}

// ---------------------------------------------------------------------------
// Empty state — shown when no doc is loaded
// ---------------------------------------------------------------------------

function CanvasEmptyState() {
  return (
    <div className="canvas-empty">
      <div className="canvas-empty-eyebrow">welcome</div>
      <div className="canvas-empty-title">Architecture Visualizer</div>
      <div className="canvas-empty-text">
        Browse platforms across layers and time. Load the example to see it in action.
      </div>
      <LoadExampleButton />
    </div>
  );
}
