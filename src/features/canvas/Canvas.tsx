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
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  useEdgesState,
  useNodesState,
  useStore,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { docStore } from "@/core/doc/DocStore";
import { buildConnection } from "@/core/doc/authoring";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useResolvedDoc } from "@/core/doc/useResolvedDoc";
import { assertNever } from "@/core/errors";
import { registerCanvasExporter } from "@/core/export/canvasExporter";
import { useCanvasPrefsStore } from "@/core/state/canvasPrefsStore";
import { useSelectionStore } from "@/core/state/selectionStore";
import { useTourStore } from "@/core/state/tourStore";
import { useViewStore } from "@/core/state/viewStore";
import { duration } from "@/design-system/tokens";
import { LoadExampleButton } from "@/features/canvas/LoadExampleButton";
import { aggregateCrossGroupEdges } from "@/features/canvas/aggregateCrossGroupEdges";
import { RoutedEdge } from "@/features/canvas/edges/RoutedEdge";
import { ElementNode } from "@/features/canvas/nodes/ElementNode";
import { GroupNode } from "@/features/canvas/nodes/GroupNode";
import { useLayoutedGraph } from "@/features/canvas/useLayoutedGraph";
import { useLockedMoveHint } from "@/features/canvas/useLockedMoveHint";
import { resolveCameraAction } from "@/features/tour/cameraAction";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

import type { ResolvedEdge } from "@/core/doc/resolve";
import type { ImageFormat } from "@/core/export/canvasExporter";
import type { ConnectionType, ProjectDocument, Viewpoint } from "@/core/schema/schema";
import type { EdgeLabelMode } from "@/core/state/canvasPrefsStore";
import type { RoutedEdgeType } from "@/features/canvas/edges/RoutedEdge";
import type { ElementNodeType } from "@/features/canvas/nodes/ElementNode";
import type { GroupNodeType } from "@/features/canvas/nodes/GroupNode";
import type { PlacementMap } from "@/features/canvas/useLayoutedGraph";
import type { Connection as FlowConnection, ReactFlowInstance } from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "@/features/canvas/Canvas.css";

type CanvasNode = ElementNodeType | GroupNodeType;
type CanvasEdge = RoutedEdgeType;

const nodeTypes = { element: ElementNode, group: GroupNode };
const edgeTypes = { routed: RoutedEdge };

// Below this zoom the cards drop their detail (description / tags / labels) so
// a zoomed-out overview reads as a clean block diagram — see Canvas.css LOD
// rules. Computed off React Flow's transform, bucketed so it only flips state
// when the threshold is actually crossed (no re-render per zoom tick).
const LOD_FAR_ZOOM = 0.55;

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
  const mvpMode = useViewStore((s) => s.mvpMode);
  const cursorMode = useViewStore((s) => s.cursorMode);
  const setCursorMode = useViewStore((s) => s.setCursorMode);
  const placements = useLayoutedGraph(doc, currentLayer);

  // Readability prefs (persisted). Each is independently toggleable in DISPLAY.
  const density = useCanvasPrefsStore((s) => s.density);
  const edgeLabels = useCanvasPrefsStore((s) => s.edgeLabels);
  const focusOnSelect = useCanvasPrefsStore((s) => s.focusOnSelect);
  const hoverFocus = useCanvasPrefsStore((s) => s.hoverFocus);
  const aggregateCrossGroup = useCanvasPrefsStore((s) => s.aggregateCrossGroup);

  // Node currently under the pointer (for hover-to-focus). Local UI state.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Semantic-zoom level-of-detail, bucketed off the live zoom.
  const lod = useStore((s) => (s.transform[2] < LOD_FAR_ZOOM ? "far" : "near"));

  // Nudge the user who keeps trying to drag nodes while the layout is locked.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const lockHint = useLockedMoveHint(canvasRef, cursorMode === "lock");

  const select = useSelectionStore((s) => s.select);
  const toggle = useSelectionStore((s) => s.toggle);
  const clearSelection = useSelectionStore((s) => s.clear);
  const selectedId = useSelectionStore((s) => s.selectedId);

  // Tour playback — the Canvas owns the camera + node dimming. The step's
  // highlight set (when present) dims everything else; an inactive tour or a
  // step with no highlight leaves all nodes at full opacity.
  const activeTourId = useTourStore((s) => s.activeTourId);
  const tourStepIndex = useTourStore((s) => s.stepIndex);
  const tourHighlight = useMemo<ReadonlySet<string> | null>(() => {
    if (activeTourId === null) return null;
    const step = doc?.tours?.find((t) => t.id === activeTourId)?.steps[tourStepIndex];
    if (step?.highlight === undefined || step.highlight.length === 0) return null;
    return new Set(step.highlight);
  }, [doc, activeTourId, tourStepIndex]);

  // Focus target: hovering wins (most responsive), else the current selection.
  // A tour owns dimming exclusively, so focus stands down while one plays.
  const focusTargetId =
    activeTourId !== null
      ? null
      : hoverFocus && hoveredId !== null
        ? hoveredId
        : focusOnSelect && selectedId !== null
          ? selectedId
          : null;

  // The focus target plus its direct neighbors — drives node dimming and edge
  // emphasis. Null means nothing is focused (everything reads at rest).
  const focusIds = useMemo<ReadonlySet<string> | null>(() => {
    if (focusTargetId === null || resolved === null) return null;
    const set = new Set<string>([focusTargetId]);
    for (const e of resolved.edges) {
      if (e.from === focusTargetId) set.add(e.to);
      if (e.to === focusTargetId) set.add(e.from);
    }
    return set;
  }, [focusTargetId, resolved]);

  // One highlight set drives both node dimming and edge emphasis. Tour wins;
  // otherwise the focus (hover/selection) set; otherwise null.
  const highlightIds = tourHighlight ?? focusIds;

  // Lookups for cross-group edge bundling.
  const elementById = useMemo(() => new Map((doc?.elements ?? []).map((e) => [e.id, e])), [doc]);

  // Build a fast lookup of MVP id → signature color (passed into every node)
  const mvpColors = useMemo(() => buildMvpColorMap(doc), [doc]);

  // Derive the "next" set of nodes from the doc + layout + containment.
  const derivedNodes = useMemo<CanvasNode[]>(() => {
    if (resolved === null) return [];
    return buildNodes(resolved, placements, mvpColors, highlightIds, mvpMode === "overlay");
  }, [resolved, placements, mvpColors, highlightIds, mvpMode]);

  const derivedEdges = useMemo<CanvasEdge[]>(() => {
    if (resolved === null) return [];
    // Optionally bundle cross-subsystem links into one ×N line per group pair
    // (edges touching the focused node stay real). Then style each edge.
    const visibleIds = new Set(resolved.elements.map((e) => e.id));
    const edges = aggregateCrossGroup
      ? aggregateCrossGroupEdges(resolved.edges, elementById, visibleIds, highlightIds)
      : resolved.edges;
    return edges.map((e): CanvasEdge => edgeFromResolved(e, highlightIds, edgeLabels));
  }, [resolved, highlightIds, edgeLabels, aggregateCrossGroup, elementById]);

  // React Flow state — owns selection internally. Without these handlers,
  // single-click selection silently fails (the change event is dropped).
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(derivedEdges);

  // Our selection store is the single source of truth for which nodes read as
  // selected (so shift-click / box-select multi-selection shows the glow on
  // every member, regardless of React Flow's own key conventions). Sync it onto
  // the React Flow nodes whenever the derived graph or the selection changes.
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  useEffect(() => {
    const selectedSet = new Set(selectedIds);
    setNodes(derivedNodes.map((n) => ({ ...n, selected: selectedSet.has(n.id) })));
  }, [derivedNodes, selectedIds, setNodes]);

  useEffect(() => {
    setEdges(derivedEdges);
  }, [derivedEdges, setEdges]);

  // Sync TO selection store (so the inspector can react). Single selection is
  // CLICK-driven (onNodeClick fires only on a true click, never a drag start —
  // so beginning to move a node doesn't pop the inspector). Shift-click toggles
  // membership for multi-select; box-select is handled via onSelectionChange
  // below, gated to the select tool.
  const onNodeClick = (event: React.MouseEvent, node: CanvasNode) => {
    if (event.shiftKey) toggle(node.id);
    else select(node.id);
  };

  const onPaneClick = () => {
    clearSelection();
  };

  // Box-select: React Flow owns the marquee (enabled via selectionOnDrag for
  // the select tool). We mirror its result into our store ONLY in select mode —
  // in pan mode onSelectionChange would also fire on a node-drag start, which is
  // exactly the inspector-popping behaviour onNodeClick exists to avoid.
  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: readonly CanvasNode[] }) => {
      if (useViewStore.getState().cursorMode !== "select") return;
      const ids = selectedNodes.map((n) => n.id);
      // We also push our store's selection back onto the nodes (see the sync
      // effect), so guard against echoing an unchanged set into a render loop.
      const current = useSelectionStore.getState().selectedIds;
      if (sameIdSet(ids, current)) return;
      useSelectionStore.getState().setMany(ids);
    },
    [],
  );

  // Hover-to-focus: track the node under the pointer (only when the pref is on,
  // so we don't pay re-renders for a feature that's disabled).
  const onNodeMouseEnter = (_event: React.MouseEvent, node: CanvasNode) => {
    if (hoverFocus) setHoveredId(node.id);
  };

  const onNodeMouseLeave = () => {
    if (hoverFocus) setHoveredId(null);
  };

  // Drag-to-connect: draw a new connection between two node handles. The edge
  // is introduced at the current MVP and gated to the current layer so it's
  // visible immediately, and written through DocStore (one undo step).
  const onConnect = (connection: FlowConnection) => {
    const current = docStore.get();
    if (current === null) return;
    const { source, target } = connection;
    if (source === target) return; // no self-loops
    const { currentLayer: layer, currentMvp: mvp } = useViewStore.getState();
    const introducedIn = mvp ?? [...current.mvps].sort((a, b) => a.order - b.order)[0]?.id;
    if (introducedIn === undefined) return;
    const takenIds = new Set(current.connections.map((c) => c.id));
    docStore.addConnection(
      buildConnection({ from: source, to: target, takenIds, introducedIn, minLayer: layer }),
    );
  };

  // Persist drag-to-position into the doc as a layer-scoped override. Stored
  // ALWAYS relative to the layout parent (so the merge in useLayoutedGraph,
  // which re-accumulates absolute coordinates, stays correct). For a nested
  // node React Flow already reports a parent-relative position; for a node
  // rendered top-level whose layout parent is hidden, we subtract the parent's
  // absolute offset ourselves.
  const persistNodePosition = useCallback(
    (node: CanvasNode) => {
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
    },
    [placements, currentLayer],
  );

  const onNodeDragStop = (_event: React.MouseEvent, node: CanvasNode) => {
    persistNodePosition(node);
  };

  // Dragging a multi-selection moves every selected node together; React Flow
  // reports the group via onSelectionDragStop. Persist each one (all land in a
  // single undo capture window — see DocStore).
  const onSelectionDragStop = (_event: React.MouseEvent, draggedNodes: CanvasNode[]) => {
    for (const node of draggedNodes) persistNodePosition(node);
  };

  // Fit view once when the first batch of positions lands for a project.
  // Re-arm only when the project ID changes (a different project was loaded),
  // NOT on every doc mutation — otherwise any rename/edit resets the viewport.
  const flowRef = useRef<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(null);
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
    <div
      className="canvas"
      data-cursor={cursorMode}
      data-lock-alert={lockHint.visible}
      data-density={density}
      data-lod={lod}
      ref={canvasRef}
    >
      <ReactFlow<CanvasNode, CanvasEdge>
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onSelectionChange={onSelectionChange}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStop={onSelectionDragStop}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2.5}
        nodesDraggable={cursorMode !== "lock"}
        nodesConnectable={cursorMode !== "lock"}
        elementsSelectable
        // Cursor tool — "pan"/"lock" drag the viewport; "select" marquee-selects
        // and moves panning onto the middle/right mouse button. "lock" also
        // freezes node dragging (browse without disturbing the layout).
        selectionOnDrag={cursorMode === "select"}
        panOnDrag={cursorMode === "select" ? PAN_MOUSE_BUTTONS : true}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false}>
          <ControlButton
            onClick={() => {
              setCursorMode("pan");
            }}
            title="Pan tool — drag to move the canvas"
            aria-label="Pan tool"
            aria-pressed={cursorMode === "pan"}
            className={cursorMode === "pan" ? "cursor-tool-active" : undefined}
          >
            <HandIcon />
          </ControlButton>
          <ControlButton
            onClick={() => {
              setCursorMode("select");
            }}
            title="Select tool — drag to box-select"
            aria-label="Select tool"
            aria-pressed={cursorMode === "select"}
            className={cursorMode === "select" ? "cursor-tool-active" : undefined}
          >
            <CursorIcon />
          </ControlButton>
          <ControlButton
            onClick={() => {
              setCursorMode("lock");
            }}
            title="Locked tool — pan and select, but nodes can't be moved"
            aria-label="Locked tool"
            aria-pressed={cursorMode === "lock"}
            className={cursorMode === "lock" ? "cursor-tool-active" : undefined}
          >
            <LockIcon />
          </ControlButton>
        </Controls>
      </ReactFlow>

      {lockHint.visible ? (
        <div key={lockHint.nonce} className="lock-move-hint" role="status">
          <span className="lock-move-hint-icon">
            <LockIcon />
          </span>
          <span>
            Layout is locked. Switch to the <strong>pan</strong> or <strong>select</strong> tool to
            move nodes.
          </span>
        </div>
      ) : null}

      <CanvasStatus kind={canvasStatusKind(doc, resolved, nodes.length)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas status — the one intentional state for every empty/loading surface
// ---------------------------------------------------------------------------
// Resolves the canvas into exactly one of: a first-run welcome, an empty
// project, a view that gates everything out at this layer/MVP, an in-progress
// layout, or "show the graph". Keeps the blank-canvas cases from reading as a
// glitch. See issue #19.

type CanvasStatusKind = "welcome" | "empty-project" | "empty-view" | "computing" | "ready";

function canvasStatusKind(
  doc: ProjectDocument | null,
  resolved: ReturnType<typeof useResolvedDoc>,
  nodeCount: number,
): CanvasStatusKind {
  if (doc === null) return "welcome";
  if (doc.elements.length === 0) return "empty-project";
  if (resolved !== null && resolved.elements.length === 0) return "empty-view";
  // Elements resolve in but no nodes are placed yet → ELK is still laying out.
  if (resolved !== null && resolved.elements.length > 0 && nodeCount === 0) return "computing";
  return "ready";
}

// Middle + right mouse buttons keep panning available while the select tool
// owns the left-drag (React Flow encodes pan buttons as a number[]).
const PAN_MOUSE_BUTTONS = [1, 2];

/** Order-insensitive equality for two id lists (selection sets). */
function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((id) => set.has(id));
}

// ---------------------------------------------------------------------------
// Node construction — maps resolved elements + placements to React Flow nodes
// ---------------------------------------------------------------------------

function buildNodes(
  resolved: NonNullable<ReturnType<typeof useResolvedDoc>>,
  placements: PlacementMap,
  mvpColors: ReadonlyMap<string, string>,
  highlightIds: ReadonlySet<string> | null,
  overlay: boolean,
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
      // Overlay (diff) mode: tint the node by its introducing MVP color.
      overlay,
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

function edgeFromResolved(
  e: ResolvedEdge,
  highlightIds: ReadonlySet<string> | null,
  labelMode: EdgeLabelMode,
): CanvasEdge {
  // Aggregated edges (standing in for ≥2 rerouted connections) show a count;
  // 1:1 edges show their protocol if any.
  const labelText = e.aggregated && e.count > 1 ? `×${String(e.count)}` : e.protocol;

  // Emphasis state relative to the current focus (tour step or selection):
  //   - no focus active  → every edge sits at a calm resting weight
  //   - focus active     → edges touching it brighten; the rest fade right back
  const touchesFocus =
    highlightIds !== null && (highlightIds.has(e.from) || highlightIds.has(e.to));
  const dimmed = highlightIds !== null && !touchesFocus;
  const emphasized = touchesFocus;
  const idle = highlightIds === null;

  const opacity = dimmed ? 0.08 : emphasized ? 1 : idle ? 0.55 : 1;
  const baseWidth = e.aggregated ? 2.25 : 1.5;

  return {
    id: e.id,
    source: e.from,
    target: e.to,
    type: "routed",
    // Motion is a signal, not decoration: only animate async/event edges that
    // belong to the focused neighborhood. At rest (nothing selected) the
    // canvas is still, so no stray dashes drift across faint idle lines.
    animated: emphasized && isAnimatedEdge(e.type),
    data: {
      ...(labelText !== undefined ? { labelText } : {}),
      labelMode,
    },
    style: {
      stroke: edgeStroke(e.type),
      strokeWidth: emphasized ? baseWidth + 0.5 : baseWidth,
      ...(e.aggregated ? { strokeDasharray: "6 3" } : {}),
      opacity,
      transition: "opacity var(--duration-base) var(--ease-out)",
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

// A little hue per connection type so kinds of traffic read apart at a glance
// without shouting. Sync stays neutral (the common case); async/event/data each
// pick up a restrained tint.
function edgeStroke(type: ConnectionType): string {
  switch (type) {
    case "sync":
      return "var(--color-fg-faint)";
    case "async":
      return "var(--color-fg-muted)";
    case "event":
      return "var(--color-accent-base)";
    case "data":
      return "var(--color-tone-success)";
    default:
      return assertNever(type);
  }
}

// ---------------------------------------------------------------------------
// Empty state — shown when no doc is loaded
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cursor-tool icons (rendered inside the React Flow control bar)
// ---------------------------------------------------------------------------

function HandIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 4l7 16 2-6 6-2z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function CanvasStatus({ kind }: { kind: CanvasStatusKind }) {
  if (kind === "ready") return null;

  if (kind === "welcome") {
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

  if (kind === "computing") {
    return (
      <div className="canvas-status" role="status" aria-live="polite">
        <span className="canvas-status-spinner" aria-hidden />
        <span className="canvas-status-text">Laying out the diagram…</span>
      </div>
    );
  }

  // empty-project / empty-view — both render a calm centered message.
  const copy =
    kind === "empty-project"
      ? {
          eyebrow: "empty project",
          title: "No elements yet",
          text: "This project has no elements. Add one, or open a different project file.",
        }
      : {
          eyebrow: "nothing here",
          title: "Nothing at this view",
          text: "Every element is hidden at the current layer and MVP. Try a broader layer or a later MVP.",
        };

  return (
    <div className="canvas-empty">
      <div className="canvas-empty-eyebrow">{copy.eyebrow}</div>
      <div className="canvas-empty-title">{copy.title}</div>
      <div className="canvas-empty-text">{copy.text}</div>
    </div>
  );
}
