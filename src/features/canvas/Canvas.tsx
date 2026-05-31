// ============================================================================
// Canvas — wrapper around React Flow
// ============================================================================
// THE ONLY FILE in the codebase that imports @xyflow/react directly (along
// with the node components in ./nodes/). Application code renders <Canvas />
// and never sees xyflow types.
//
// Data flow:
//   doc → useResolvedDoc → (elements + edges + containment at layer/mvp)
//   doc → useLayoutedGraph → placements (nested ELK auto-layout per layer)
//   selection ↔ selectionStore
//
// Containment: an element that currently has visible children renders as a
// `group` container node; its children are React Flow sub-flow nodes
// (parentId + extent:"parent") positioned inside it. A collapsed container
// renders as a normal `element` node carrying an expand chevron. See
// resolve() for how the expand/collapse state is decided.
//
// Critical pattern: nodes/edges are kept in React Flow's own state via
// useNodesState/useEdgesState. Without onNodesChange wired up, React Flow
// drops the user's click-to-select change and selection silently fails.
// We sync FROM the doc (when it changes) and TO our selection store
// (via onNodeClick — selection is click-driven, never on drag).
// ============================================================================

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { docStore } from "@/core/doc/DocStore";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useResolvedDoc } from "@/core/doc/useResolvedDoc";
import { assertNever } from "@/core/errors";
import { registerCanvasExporter } from "@/core/export/canvasExporter";
import { useSelectionStore } from "@/core/state/selectionStore";
import { useTourStore } from "@/core/state/tourStore";
import { useViewStore } from "@/core/state/viewStore";
import { duration } from "@/design-system/tokens";
import { LoadExampleButton } from "@/features/canvas/LoadExampleButton";
import { ElementNode } from "@/features/canvas/nodes/ElementNode";
import { GroupNode } from "@/features/canvas/nodes/GroupNode";
import { useLayoutedGraph } from "@/features/canvas/useLayoutedGraph";
import { resolveCameraAction } from "@/features/tour/cameraAction";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

import type { ResolvedEdge } from "@/core/doc/resolve";
import type { ImageFormat } from "@/core/export/canvasExporter";
import type { ConnectionType, ProjectDocument, Viewpoint } from "@/core/schema/schema";
import type { ElementNodeType } from "@/features/canvas/nodes/ElementNode";
import type { GroupNodeType } from "@/features/canvas/nodes/GroupNode";
import type { PlacementMap } from "@/features/canvas/useLayoutedGraph";
import type { Edge, ReactFlowInstance } from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "@/features/canvas/Canvas.css";

type CanvasNode = ElementNodeType | GroupNodeType;

const nodeTypes = { element: ElementNode, group: GroupNode };

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
  const placements = useLayoutedGraph(doc, currentLayer);

  const select = useSelectionStore((s) => s.select);

  // Tour playback — the Canvas owns the camera + node dimming. The step's
  // highlight set (when present) dims everything else; an inactive tour or a
  // step with no highlight leaves all nodes at full opacity.
  const activeTourId = useTourStore((s) => s.activeTourId);
  const tourStepIndex = useTourStore((s) => s.stepIndex);
  const highlightIds = useMemo<ReadonlySet<string> | null>(() => {
    if (activeTourId === null) return null;
    const step = doc?.tours?.find((t) => t.id === activeTourId)?.steps[tourStepIndex];
    if (step?.highlight === undefined || step.highlight.length === 0) return null;
    return new Set(step.highlight);
  }, [doc, activeTourId, tourStepIndex]);

  // Build a fast lookup of MVP id → signature color (passed into every node)
  const mvpColors = useMemo(() => buildMvpColorMap(doc), [doc]);

  // Derive the "next" set of nodes from the doc + layout + containment.
  const derivedNodes = useMemo<CanvasNode[]>(() => {
    if (resolved === null) return [];
    return buildNodes(resolved, placements, mvpColors, highlightIds);
  }, [resolved, placements, mvpColors, highlightIds]);

  const derivedEdges = useMemo<Edge[]>(() => {
    if (resolved === null) return [];
    return resolved.edges.map((e): Edge => edgeFromResolved(e, isEdgeDimmed(e, highlightIds)));
  }, [resolved, highlightIds]);

  // React Flow state — owns selection internally. Without these handlers,
  // single-click selection silently fails (the change event is dropped).
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(derivedEdges);

  // Sync FROM doc → React Flow state, preserving selection across re-derives.
  useEffect(() => {
    setNodes((prev) => {
      const selectedSet = new Set(prev.filter((n) => n.selected === true).map((n) => n.id));
      return derivedNodes.map((n) => (selectedSet.has(n.id) ? { ...n, selected: true } : n));
    });
  }, [derivedNodes, setNodes]);

  useEffect(() => {
    setEdges(derivedEdges);
  }, [derivedEdges, setEdges]);

  // Sync TO selection store (so the inspector can react). Selection is
  // CLICK-driven only: we deliberately do NOT use onSelectionChange, because
  // React Flow fires it on pointer-down — the start of a drag — which would
  // open the inspector the moment you begin moving a node. onNodeClick fires
  // only on a true click (no drag), and onPaneClick clears it.
  const onNodeClick = (_event: React.MouseEvent, node: CanvasNode) => {
    select(node.id);
  };

  const onPaneClick = () => {
    select(null);
  };

  // Persist drag-to-position into the doc as a layer-scoped override. Stored
  // ALWAYS relative to the layout parent (so the merge in useLayoutedGraph,
  // which re-accumulates absolute coordinates, stays correct). For a nested
  // node React Flow already reports a parent-relative position; for a node
  // rendered top-level whose layout parent is hidden, we subtract the parent's
  // absolute offset ourselves.
  const onNodeDragStop = (_event: React.MouseEvent, node: CanvasNode) => {
    const placement = placements.get(node.id);
    const layoutParentId = placement?.parentId ?? null;
    const renderedNested = node.parentId !== undefined;

    let position = node.position;
    if (!renderedNested && layoutParentId !== null) {
      const parent = placements.get(layoutParentId);
      position = {
        x: node.position.x - (parent?.absX ?? 0),
        y: node.position.y - (parent?.absY ?? 0),
      };
    }
    docStore.setElementLayoutOverride(currentLayer, node.id, position);
  };

  // Fit view once when the first batch of positions lands for a project.
  // Re-arm only when the project ID changes (a different project was loaded),
  // NOT on every doc mutation — otherwise any rename/edit resets the viewport.
  const flowRef = useRef<ReactFlowInstance<CanvasNode> | null>(null);
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

  // -- Save / restore view around a tour -----------------------------------
  // On entering a tour, snapshot the viewport + selection + layer + MVP and
  // clear the selection (so dimming reads cleanly). On exit, restore them.
  // This effect is declared BEFORE the camera effect so, on the enter render,
  // the snapshot is taken before a step's layer/MVP override is applied.
  const tourSnapshot = useRef<{
    viewport: { x: number; y: number; zoom: number };
    selectedId: string | null;
    layer: ProjectDocument["layers"][number]["id"];
    mvp: string | null;
  } | null>(null);

  useEffect(() => {
    const flow = flowRef.current;
    if (activeTourId !== null && tourSnapshot.current === null) {
      tourSnapshot.current = {
        viewport: flow?.getViewport() ?? { x: 0, y: 0, zoom: 1 },
        selectedId: useSelectionStore.getState().selectedId,
        layer: useViewStore.getState().currentLayer,
        mvp: useViewStore.getState().currentMvp,
      };
      select(null);
    } else if (activeTourId === null && tourSnapshot.current !== null) {
      const snap = tourSnapshot.current;
      tourSnapshot.current = null;
      useViewStore.getState().setLayer(snap.layer);
      if (snap.mvp !== null) useViewStore.getState().setMvp(snap.mvp);
      select(snap.selectedId);
      if (flow !== null) {
        void flow.setViewport(snap.viewport, {
          duration: prefersReducedMotion() ? 0 : duration.base,
        });
      }
    }
  }, [activeTourId, select]);

  // -- Tour camera ---------------------------------------------------------
  // Move the camera per the active step (animated, or instant under reduced
  // motion). A step may also override the layer / MVP; we apply those first,
  // then move the camera on the next tick so freshly-revealed nodes exist.
  const applyCamera = useCallback((viewpoint: Viewpoint) => {
    const flow = flowRef.current;
    if (flow === null) return;
    const dur = prefersReducedMotion() ? 0 : duration.cinematic;
    const action = resolveCameraAction(viewpoint);
    switch (action.kind) {
      case "fitAll":
        void flow.fitView({ duration: dur, padding: 0.2 });
        return;
      case "focus":
        void flow.fitView({
          nodes: [{ id: action.id }],
          duration: dur,
          padding: 0.45,
          maxZoom: action.zoom ?? 1.6,
        });
        return;
      case "center":
        void flow.setCenter(action.x, action.y, { zoom: action.zoom ?? 1.4, duration: dur });
        return;
      case "none":
        return;
      default:
        assertNever(action);
    }
  }, []);

  useEffect(() => {
    if (activeTourId === null) return;
    const step = doc?.tours?.find((t) => t.id === activeTourId)?.steps[tourStepIndex];
    if (step === undefined) return;
    if (step.viewpoint.layer !== undefined) useViewStore.getState().setLayer(step.viewpoint.layer);
    if (step.viewpoint.mvp !== undefined) useViewStore.getState().setMvp(step.viewpoint.mvp);
    const timer = window.setTimeout(() => {
      applyCamera(step.viewpoint);
    }, 90);
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeTourId, tourStepIndex, doc, applyCamera]);

  // -- Image export --------------------------------------------------------
  // Register an exporter the inspector's Export section can call. We capture
  // the React Flow viewport layer (nodes + edges, no UI chrome) framed to the
  // current nodes — i.e. "export what you see" at the current layer + MVP.
  useEffect(() => {
    const exporter = async (format: ImageFormat): Promise<string> => {
      const flow = flowRef.current;
      if (flow === null) throw new Error("Canvas is not ready.");
      const rfNodes = flow.getNodes();
      if (rfNodes.length === 0) throw new Error("Nothing to export at this view.");

      const bounds = getNodesBounds(rfNodes);
      const PADDING = 48;
      const width = Math.ceil(bounds.width + PADDING * 2);
      const height = Math.ceil(bounds.height + PADDING * 2);

      const viewportEl = document.querySelector<HTMLElement>(".react-flow__viewport");
      if (viewportEl === null) throw new Error("Canvas viewport not found.");

      // Frame the whole graph 1:1 with padding (no UI chrome captured).
      const options = {
        backgroundColor: readToken("--color-bg-1"),
        width,
        height,
        style: {
          width: `${String(width)}px`,
          height: `${String(height)}px`,
          transform: `translate(${String(-bounds.x + PADDING)}px, ${String(-bounds.y + PADDING)}px) scale(1)`,
        },
      };

      // Lazy-load the image library — only paid for on an actual export.
      const { toPng, toSvg } = await import("html-to-image");
      return format === "png" ? toPng(viewportEl, options) : toSvg(viewportEl, options);
    };

    registerCanvasExporter(exporter);
    return () => {
      registerCanvasExporter(null);
    };
  }, []);

  return (
    <div className="canvas">
      <ReactFlow<CanvasNode, Edge>
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
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
// Node construction — maps resolved elements + placements to React Flow nodes
// ---------------------------------------------------------------------------

function buildNodes(
  resolved: NonNullable<ReturnType<typeof useResolvedDoc>>,
  placements: PlacementMap,
  mvpColors: ReadonlyMap<string, string>,
  highlightIds: ReadonlySet<string> | null,
): CanvasNode[] {
  const visibleIds = new Set(resolved.elements.map((e) => e.id));

  const nodes: CanvasNode[] = [];
  for (const element of resolved.elements) {
    const placement = placements.get(element.id);
    if (placement === undefined) continue;
    const containment = resolved.containment.get(element.id);

    // Render under the layout parent only when that parent is itself visible;
    // otherwise (e.g. an intermediate container scrubbed away by the MVP) fall
    // back to an absolute, top-level placement.
    const renderParentId =
      placement.parentId !== null && visibleIds.has(placement.parentId) ? placement.parentId : null;

    const position =
      renderParentId !== null
        ? { x: placement.x, y: placement.y }
        : { x: placement.absX, y: placement.absY };

    const data = {
      element,
      introducedColor: mvpColors.get(element.lifecycle.introducedIn) ?? null,
      introducedIn: element.lifecycle.introducedIn,
      canExpand: containment?.canExpand ?? false,
      isExpanded: containment?.isExpanded ?? true,
      // Dimmed when a tour step highlights a set this node isn't part of.
      dimmed: highlightIds !== null && !highlightIds.has(element.id),
    };

    const common = {
      id: element.id,
      position,
      zIndex: depthOf(element.id, placements),
      ...(renderParentId !== null ? { parentId: renderParentId, extent: "parent" as const } : {}),
    };

    if (containment?.hasVisibleChildren === true) {
      nodes.push({
        ...common,
        type: "group",
        data,
        style: { width: placement.width, height: placement.height },
      });
    } else {
      nodes.push({ ...common, type: "element", data });
    }
  }

  // React Flow requires a parent to appear before its children. Sorting by
  // depth (ancestors first) guarantees that for any nesting level.
  nodes.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  return nodes;
}

/** Number of layout ancestors — used both for z-order and parent-before-child ordering. */
function depthOf(id: string, placements: PlacementMap): number {
  let depth = 0;
  let parentId = placements.get(id)?.parentId ?? null;
  while (parentId !== null && depth < 32) {
    depth += 1;
    parentId = placements.get(parentId)?.parentId ?? null;
  }
  return depth;
}

// ---------------------------------------------------------------------------
// MVP color lookup
// ---------------------------------------------------------------------------

function buildMvpColorMap(doc: ProjectDocument | null): ReadonlyMap<string, string> {
  if (doc === null) return new Map();
  return new Map(doc.mvps.map((m) => [m.id, m.color]));
}

/** Read a CSS custom property off :root. Used by the image exporter to bake
 *  the themed background into the capture (event-handler context, not render). */
function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
}

// ---------------------------------------------------------------------------
// Edge styling — type-aware, exhaustive switch so adding a new ConnectionType
// causes a compile error rather than a silent styling gap.
// ---------------------------------------------------------------------------

function edgeFromResolved(e: ResolvedEdge, dimmed: boolean): Edge {
  // Aggregated edges (standing in for ≥2 rerouted connections) show a count;
  // 1:1 edges show their protocol if any.
  const label = e.aggregated && e.count > 1 ? `×${String(e.count)}` : e.protocol;
  return {
    id: e.id,
    source: e.from,
    target: e.to,
    type: "smoothstep",
    animated: !dimmed && isAnimatedEdge(e.type),
    label,
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 4,
    style: {
      stroke: edgeStroke(e.type),
      strokeWidth: e.aggregated ? 2.25 : 1.5,
      ...(e.aggregated ? { strokeDasharray: "6 3" } : {}),
      // Tour dimming: fade edges that don't touch a highlighted node.
      opacity: dimmed ? 0.12 : 1,
      transition: "opacity var(--duration-base) var(--ease-out)",
    },
  };
}

/** An edge is dimmed during a tour step unless one of its endpoints is highlighted. */
function isEdgeDimmed(e: ResolvedEdge, highlightIds: ReadonlySet<string> | null): boolean {
  if (highlightIds === null) return false;
  return !highlightIds.has(e.from) && !highlightIds.has(e.to);
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
