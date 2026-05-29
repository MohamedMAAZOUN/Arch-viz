# Backlog

A standing planning document for arch-vis. Updated as work lands and as new gaps surface.

This is a **living doc**, not a contract. Items move between sections, get split, or get dropped as real use reveals what matters. When in doubt, prefer using the tool over building from this list — the most valuable items usually come from "I tried to do X and couldn't."

**Status legend**: 🔴 not started · 🟡 partial · 🟢 done-but-needs-polish

**Effort**: XS (< 1h) · S (half session) · M (one session) · L (multi-session) · XL (needs breaking down first)

**Last reconciled against the codebase**: 2026-05-29.

---

## Table of contents

1. [Features](#1-features)
2. [Bugs & correctness](#2-bugs--correctness)
3. [Tech debt](#3-tech-debt)
4. [Testing](#4-testing)
5. [Polish & UX](#5-polish--ux)
6. [Performance](#6-performance)
7. [Accessibility](#7-accessibility)
8. [Documentation](#8-documentation)
9. [Deferred to v1.5+](#9-deferred-to-v15)
10. [Done — recently shipped](#10-done--recently-shipped)

---

## 1. Features

User-visible capabilities not yet built (or only stubbed).

### 1.1 — Nested node containment (hierarchical view) 🔴

**Priority**: highest — this is the next thing to build. It changes the core spatial model from flat to hierarchical, which is how architects actually think about infrastructure (cluster → node → pod → container; domain → service → library).

**Problem**: Today, `parent` is metadata, not containment. The schema fully models hierarchy (every element has an optional `parent`, `group` is a type, `aggregateAt` controls layer-driven collapsing), and `resolve()` uses `parent` for *aggregation* (hide children when the parent group aggregates at the current layer — the business-layer collapse). But the canvas renders **flat**: when a group is not aggregating, its children are laid out by ELK as independent peers rather than visually nested *inside* the parent box. React Flow's native parent/child containment (`parentId` + `extent: "parent"`) is not wired at all.

The intended experience — look *inside* a Kubernetes node to see its backend/frontend services, then inside those to see dependencies, with depth revealed as you move toward the engineering layer — is designed-for in the data model but absent from the view.

**Why it matters**:
- Nesting is the primary tool for taming visual complexity. The scale test (280 nodes) becomes spaghetti when flat; containment is how you make a large graph legible.
- It's the spatial expression of the same progressive-disclosure idea as the layer system.
- It's table-stakes for the tools in this space (Ilograph, Structurizr) because it matches the mental model.

**Why it's feasible despite what's shipped**:
- **No schema change** — `parent` and `group` already exist; this leans on data you're already authoring.
- **React Flow has first-class sub-flow support** — `parentId`, `extent: "parent"`, child positions relative to parent, parent auto-sizing. Documented feature, not a hack.
- **The wrapper boundary contains the work** — this is a Canvas + layout concern. `Canvas.tsx` and `useLayoutedGraph.ts` are where it lives; schema, DocStore, inspector, state stores stay untouched.

**The hard parts (be honest)**:
- **ELK nested layout.** ELK supports hierarchical layout (children laid out within parent bounds, parent sized to fit its children), but `layout.worker.ts` currently flattens the graph. The real work is building the recursive graph we hand ELK and mapping the nested result back to React Flow parent/child nodes. This is also where the existing ~1s layout cost at scale could grow — measure it.
- **Expand/collapse interaction.** "Look inside" implies per-node expand state, distinct from the automatic layer-driven aggregation we already have. New view state + node affordances (a chevron / double-click to expand).
- **Two hiding systems coexisting.** Layer-driven `aggregateAt` (automatic) and user-driven expand/collapse (manual) both decide what's visible. Reconciling them needs a clear model or it gets confusing.

**Open design questions (resolve before building)**:
1. **What drives containment?** Three candidates: (a) purely automatic from `parent` + layer, (b) explicit user expand/collapse, (c) both. Leaning toward: automatic default state per layer, with manual override.
2. **Does nesting replace `aggregateAt`?** Possibly. If a group can be expanded/collapsed and auto-collapses at higher layers, `aggregateAt` may become redundant — or it becomes the *default* collapsed-state hint. Decide whether they merge.
3. **How deep does nesting go?** Schema allows arbitrary `parent` chains. Cap visual depth? Lazy-render deep levels for performance?
4. **What about cross-boundary edges?** An edge from a node inside group A to a node inside group B — does it route between the children, or aggregate to a group-to-group edge when collapsed? (`resolve()` already has connection-aggregation logic to build on.)
5. **Layout performance** with nested ELK at 280 nodes — needs a spike against the scale-test fixture before committing to the approach.

**Implementation sketch**:
- Extend the resolve/layout pipeline to emit a **tree** (parent → children) instead of a flat list when a group is expanded at the current layer.
- In the worker, build a recursive ELK graph (`children` nested inside parent nodes); ELK returns parent sizes + child positions relative to parent.
- In `Canvas.tsx`, map that to React Flow nodes with `parentId` and `extent: "parent"`; render group nodes as a distinct container component (the existing `group` glyph becomes a sized, labeled frame).
- Add an `expandedGroups` set to view state (Zustand); default derived from layer + `aggregateAt`, user-toggleable.
- A new `GroupNode` container component (header with name + collapse chevron, children render inside).

**Acceptance criteria**:
- At the architecture/engineering layers, a group renders as a frame *containing* its child nodes, not as a peer beside them.
- Expanding/collapsing a group shows/hides its children in place, animated.
- Nested depth of at least 3 (e.g. domain → service → data) renders correctly.
- Cross-group edges route sensibly whether endpoints are expanded or collapsed.
- Layout at 280 nodes stays usable (measure; may need the perf work in §6.1 first).

**Dependencies**: none in the schema. Pairs naturally with §6.1 (layout performance) — do the perf spike as part of this.

**Effort**: L. Best done as its own focused effort with a short design pass up front, not bolted onto an unrelated session.

---

### 1.2 — Tour mode playback 🔴

**Priority**: high — this is the "Prezi-feel" differentiator that motivated the project.

**Problem**: The schema defines `tours` (an array of named tours, each with ordered `steps` carrying a viewpoint, caption, optional highlighted element ids, and a duration). Nothing consumes them. The `src/features/tour/` folder exists but is empty.

**Approach**:
- A `TourPlayer` component that, given a tour, scrubs through its steps.
- Each step transitions the camera via React Flow's `setViewport` (animated), dims non-highlighted nodes, and shows the caption in an overlay.
- Controls: play/pause, next/prev, step indicator, exit. Spacebar advances.
- A tour picker (dropdown or list) in the topbar or a global inspector section, visible only when `doc.tours` is non-empty.
- Respect `prefers-reduced-motion` (jump instead of glide).

**Acceptance criteria**:
- Selecting a tour enters a focused playback mode (chrome minimized).
- Each step animates the viewport and dims/undims the right nodes.
- Keyboard: space advances, escape exits, arrows step.
- Exiting restores the previous viewport and selection.

**Dependencies**: none — schema and canvas are ready.

**Effort**: M–L.

---

### 1.3 — Live data hooks (Grafana / Jira) 🔴

**Priority**: high — the killer feature for the IT4IT use case.

**Problem**: Elements can declare `dataSources` (kind = `grafana` | `jira` | `http`, with a `binding` of `status` | `badge` | `metric` | `label`). The inspector's "Live status" section lists the configured sources read-only; nothing fetches.

**Approach**:
- A fetcher per kind behind a common interface (`fetchBinding(source) → value`), wrapped like every other external dependency (one module, typed boundary).
- A polling hook (`useLiveData(element)`) that surfaces values into both the node component (badge/status dot) and the inspector (live metric/label).
- Sensible polling intervals, backoff on failure, and a visible "stale/failed" state.
- CORS / auth realities: Grafana and Jira Data Center typically need a token and won't allow direct browser calls. Likely needs a thin proxy or the existing Hermes backend. **Spike required** before committing to an approach.

**Acceptance criteria**:
- A node with a `grafana` status binding shows a live status indicator that updates on an interval.
- Fetch failures degrade gracefully (last-known value + stale marker), never crash the canvas.
- Tokens/secrets never live in the document or the client bundle.

**Dependencies**: a fetch path that satisfies CORS/auth (proxy or backend). **Blocking unknown** — resolve with a spike.

**Effort**: L (plus a preceding spike).

---

### 1.4 — Export (PNG / SVG / PDF / JSON) 🔴

**Priority**: medium.

**Problem**: The inspector's global "Export" section is a placeholder (`PNG · SVG · PDF · video · JSON. (Coming soon.)`).

**Approach**:
- **JSON**: trivial — serialize the committed doc, download. Do this first (XS).
- **PNG/SVG**: render the current canvas viewport. React Flow exposes the node bounds; `html-to-image` is the common path. Wrap it (one module).
- **PDF**: wrap the PNG/SVG in a page; lowest priority.
- Respect the current layer + MVP in the export (export what you see).

**Acceptance criteria**:
- JSON export round-trips: exported file re-loads cleanly through the parser.
- PNG/SVG capture the visible graph with correct theming.

**Dependencies**: none for JSON; an image library for raster/vector.

**Effort**: JSON XS, PNG/SVG M, PDF S (after PNG).

---

### 1.5 — MVP overlay / diff mode 🔴

**Priority**: medium — the other half of the "time" story.

**Problem**: The MVP slider scrubs to a single point in time. The original design also called for an **overlay** mode that shows multiple MVPs at once with elements colored by the MVP that introduced them (the node MVP-badge already encodes this color; overlay would make it the primary visual).

**Approach**:
- A mode toggle on the MVP slider: "single" (current) vs "overlay".
- In overlay mode, show the union of elements across a selected MVP range, each tinted by `introducedIn`.
- Optionally a diff sub-mode: added / removed / modified between two chosen MVPs.

**Acceptance criteria**:
- Overlay shows elements from multiple MVPs simultaneously, color-coded.
- The legend explains the color→MVP mapping.

**Dependencies**: none — `resolve()` already exposes everything needed.

**Effort**: M.

---

### 1.6 — Documentation & Annotations sections (inspector) 🔴

**Priority**: low.

**Problem**: The element inspector's "Documentation" and "Annotations" sections are placeholders (`Markdown notes, links, attachments. (Coming soon.)` / `Comments. (Coming soon.)`).

**Approach**:
- **Documentation**: a markdown field on the element (schema addition), rendered read + edit. Reuse `EditableField` multiline for editing; add a markdown renderer for display.
- **Annotations**: freeform comments. Naturally multiplayer-shaped — defer the collaborative version to the multiplayer epic, but a single-user notes list is cheap now.

**Acceptance criteria**:
- Markdown documentation persists on the element and renders formatted.
- Annotations can be added/removed and survive save/reload.

**Dependencies**: schema change (markdown field, annotations array). **Schema-first.**

**Effort**: Documentation S, Annotations S (single-user) / L (collaborative).

---

### 1.7 — Add / remove elements and connections from the UI 🔴

**Priority**: medium — turns it from "edit existing" into "author from scratch".

**Problem**: You can edit properties of existing elements and drag them, but can't create a new element, delete one, or draw a new connection without hand-editing YAML.

**Approach**:
- "Add element" affordance (palette or canvas right-click) → creates a minimal valid element at a sensible position, selects it for immediate naming.
- Delete via selection + keyboard (with confirm for elements that have connections).
- Draw connections by dragging between node handles (React Flow supports this; we currently set `nodesConnectable={false}`). On connect, write a new connection through DocStore.
- All operations go through DocStore mutations (undo/redo for free).

**Acceptance criteria**:
- Create, rename, and delete an element entirely in the UI.
- Draw and delete a connection in the UI.
- Every operation is a single undo step.

**Dependencies**: new DocStore mutations (`addElement`, `removeElement`, `addConnection`, `removeConnection`). Schema already supports the shapes.

**Effort**: M–L.

---

## 2. Bugs & correctness

Known-wrong or suspected-wrong behavior. (None are currently blocking; the build is green.)

### 2.1 — Animated layout transition when clearing overrides 🟡

**Symptom**: Pressing "Reorganize" (clear layer overrides) snaps nodes to their auto-layout positions instantly. The MVP-scrub path animates; this one doesn't.

**Cause**: The override-merge stage returns a new position Map synchronously; React Flow applies it without a transition.

**Fix**: Drive node position through the same Motion `layout` path used for MVP scrubbing, or animate via React Flow's node position interpolation.

**Effort**: S.

---

### 2.2 — Save error sink is console-only for programmatic open 🟡

**Symptom**: `openFilePicker` (the topbar "open" button) logs parse failures to the console; only the drag-drop path shows the visible error toast.

**Cause**: The toast lives in `<FileLoader>`, which the programmatic picker doesn't route through.

**Fix**: A shared error sink (small Zustand store or a context) that both the picker and the dropzone publish to, and a single toast host subscribes to.

**Effort**: S.

---

### 2.3 — Numeric property edit silently reverts on invalid input 🟢

**Symptom**: Editing a numeric property to a non-number does nothing (field reverts). No feedback explains why.

**Cause**: Intentional guard (`!Number.isFinite(parsed) → return`), but it's silent.

**Fix**: Inline validation message, or visually reject the keystroke. Minor.

**Effort**: XS.

---

## 3. Tech debt

Internal quality issues that don't change behavior but raise the cost of future change.

### 3.1 — Orphaned files from earlier iterations 🔴

**Problem**: Several files appear unused or superseded:
- `src/features/canvas/nodes/CustomNode.tsx` — **0 references**; `ElementNode.tsx` is the live node. Likely safe to delete.
- `src/core/doc/useDoc.ts` vs `src/core/doc/useDocSnapshot.ts` — two doc-subscription hooks; confirm which is canonical and collapse to one.
- `src/features/canvas/useCanvasGraph.ts` vs `useLayoutedGraph.ts` — confirm both are needed or merge.
- `src/core/doc/useDirty.ts` — single reference; confirm it's wired to the Save button and not dead.

**Action**: Audit each, delete or document. Add a brief note to the engineering guide about the canonical hook for reading the doc so this doesn't recur.

**Effort**: S.

---

### 3.2 — `dirty()` uses `JSON.stringify` structural compare 🟡

**Problem**: `DocStore.dirty()` compares `JSON.stringify(current)` to the committed snapshot. O(n) on every call and sensitive to key order. Fine at current scale; will bite on large docs or frequent polling.

**Fix**: Track a dirty flag set on mutate and cleared on commit/load, or hash content. Documented inline already as a known v2 item.

**Effort**: S.

---

### 3.3 — No shared toast/notification primitive 🔴

**Problem**: Errors surface ad-hoc (file-loader toast, save error in topbar, console elsewhere). There's no single notification system.

**Fix**: A small toast store + host component in `core/` or `design-system/`, consumed everywhere. Unblocks 2.2 and future async feedback.

**Effort**: S.

---

### 3.4 — `elk-worker.min.js` ships unminified-looking 1.6 MB chunk 🟡

**Problem**: The build emits `elk-worker.min-*.js` at ~1.6 MB. It's already minified and loads inside the sub-worker on demand (not on first paint), so it doesn't hit the first-load budget — but it's worth confirming it's gzipped in transit and lazy in practice.

**Action**: Verify the production server serves it gzipped/brotli and that it's only fetched when a layout is first requested. Document the finding in the engineering guide's gotchas section.

**Effort**: XS (verify) / S (if a fix is needed).

---

### 3.5 — Connection editing is loosely typed 🟡

**Problem**: `updateConnectionProperty` writes arbitrary keys with a loose type because `Connection` has a discriminated surface. Currently only `protocol`/`type` are edited in practice.

**Fix**: Tighten to a known editable key set, or model connection edits with the same path-aware approach as element properties.

**Effort**: S.

---

## 4. Testing

### 4.1 — No component / interaction tests 🔴

**Problem**: All 19 tests are unit tests on pure logic (`schema`, `resolve`, `DocStore`). No React Testing Library tests exist despite the harness (`@testing-library/react`, jsdom, `test-setup.ts`) being installed and ready.

**Approach**: Cover the high-value interactions:
- Inspector edit → DocStore mutation → re-render reflects the change.
- Selecting a node populates the element inspector.
- Layer toggle / MVP slider change the resolved set.
- Save button enabled/disabled by dirty state.

**Effort**: M.

---

### 4.2 — No end-to-end tests 🔴

**Problem**: `@playwright/test` is in devDependencies and the engineering guide references an E2E layer, but there's no `tests/` E2E suite and no `playwright.config`.

**Approach**: One critical-path spec to start: load example → edit a property → drag a node → save → reload → assert persistence. Expand from there.

**Effort**: M (including Playwright config + CI wiring).

---

### 4.3 — `resolve()` edge cases beyond the example doc 🟡

**Problem**: `resolve` tests exercise the example project well, but synthetic edge cases (empty MVP list, element removed then reintroduced, deeply nested aggregation) aren't covered.

**Effort**: S.

---

## 5. Polish & UX

### 5.1 — Empty/error states audit 🔴
Every async or empty surface should have an intentional state. Audit: layout still computing, fetch failed, no search results, doc with zero elements.
**Effort**: S.

### 5.2 — Keyboard shortcut discoverability 🔴
Undo/redo, save, and (future) tour shortcuts exist but aren't discoverable. Add a `?` shortcuts overlay.
**Effort**: S.

### 5.3 — Inspector section persistence 🟡
Section expand/collapse state resets on reload and on selection change. Persist per-section open state (and possibly per-element).
**Effort**: S.

### 5.4 — Node visual density options 🔴
At high node counts the cards are heavy. A "compact" node mode (name + type only) would help large diagrams.
**Effort**: S–M.

### 5.5 — Connection labels overlap at density 🟡
Protocol labels on edges can overlap when nodes are close. Consider hover-only labels or collision avoidance.
**Effort**: M.

### 5.6 — Multi-select on canvas 🔴
Currently single-selection. Box-select + multi-select would enable bulk operations (move several, delete several).
**Effort**: M (pairs with 1.7).

---

## 6. Performance

### 6.1 — Validate the stated budgets with a large doc 🟡

**Status**: benchmarked 2026-05-23. The budget is **not met** at scale; numbers below.

The engineering guide sets budgets (60fps slider scrub, ≤16ms render at 300 nodes, ≤200ms layout at 100 nodes). Two synthetic fixtures now exist for testing (`scale-test-100`, `scale-test-300`, selectable in Settings → Example projects, generated by `scripts/gen_scale.py`).

**ELK layout time (median of 3 runs, `layered` algorithm, in isolation):**

| Fixture | Layer | Nodes | Edges | Median layout |
|---|---|---|---|---|
| scale-100 | engineering | 87 | 97 | **394 ms** |
| scale-300 | business (aggregated) | 30 | 0 | 85 ms |
| scale-300 | architecture | 187 | 134 | 693 ms |
| scale-300 | engineering | 272 | 269 | **1093 ms** |

**Findings**:
- The **200ms-at-100-nodes budget is ~2x optimistic** for ELK `layered`. At ~90 nodes we measure ~394ms.
- At 270+ nodes, layout is ~1s. It runs in a Web Worker so the UI doesn't freeze, but a 1s wait on layer-switch / first-load is perceptible.
- The two-stage pipeline already prevents re-layout on drag/property-edit (only topology changes trigger ELK), so this cost is paid on load and layer-switch, not on every interaction.

**Options to pursue (not yet done)**:
1. Revisit the budget — 200ms may be the wrong target for this algorithm/scale.
2. Show a layout-in-progress indicator so the 1s feels intentional, not janged.
3. Cache layout results per (topology, layer) so re-visiting a layer is instant.
4. Try ELK options tuned for speed over quality (`elk.layered.thoroughness`, fewer crossing-minimization passes).
5. Consider a faster algorithm for very large graphs (trade layout quality for speed above N nodes).

**Render performance (16ms-per-frame budget) is not yet measured** — needs profiling in the browser with the 300-node fixture loaded (drag, scrub, pan).

**Effort**: indicator S · caching S · ELK tuning S (then measure) · render profiling S.

### 6.2 — Memoization audit on the canvas render path 🟡
`derivedNodes`/`derivedEdges` recompute on several deps. Confirm with the profiler that MVP scrub and selection don't trigger avoidable full rebuilds.
**Effort**: S.

### 6.3 — Inspector list virtualization 🔴
Search results and (future) large dependency lists render all rows. Virtualize past ~50 items per the engineering guide.
**Effort**: S.

---

## 7. Accessibility

### 7.1 — Canvas keyboard navigation 🔴
The engineering guide's v1 a11y standard calls for: Tab through visible nodes, arrows pan, +/- zoom, Esc clears selection, and an SR-only region announcing current layer/MVP/selection. Confirm what's implemented; fill the gaps.
**Effort**: M.

### 7.2 — Focus management for the slide-in panels 🟡
Settings menu and (future) tour overlay should trap focus while open and restore it on close. Verify and fix.
**Effort**: S.

### 7.3 — Contrast audit for new token combinations 🟡
Any new color pairings (MVP badges, tone bars on the node) should be checked for WCAG AA in both themes and both brands.
**Effort**: S.

---

## 8. Documentation

### 8.1 — ADRs for decisions made after the scaffold 🔴
Only `0001-initial-scaffold.md` exists. Decisions that deserve an ADR: the ELK `elk-api`-in-worker approach (currently only in gotchas), the two-stage layout pipeline (auto-layout + override merge), the state-tier split, and the per-layer position-override model.
**Effort**: S.

### 8.2 — Per-folder READMEs 🔴
The engineering guide calls for short READMEs in `core/`, `features/`, `design-system/`. None exist yet.
**Effort**: S.

### 8.3 — Schema reference doc 🟡
`schema-example.yaml` documents by example. A prose reference (every field, every invariant, every enum) would help authors writing YAML by hand.
**Effort**: M.

### 8.4 — Screenshots / GIFs in the README 🔴
The README is text-only. A short GIF of layer toggle + MVP scrub + edit would orient newcomers instantly.
**Effort**: XS (once the tool is visually stable).

---

## 9. Deferred to v1.5+

Explicitly out of scope for v1. Listed so they're not forgotten — **do not start without confirming.**

### 9.1 — Monaco YAML editor 🔴
In-app YAML editing with syntax highlighting, schema-aware completion, and inline validation. Deferred per the dependency study; a plain `<textarea>` + Zod validation is the v1 stand-in. **Effort**: L.

### 9.2 — Video export of MVP transitions 🔴
Record the MVP-scrub animation as a video/GIF for presentations. **Effort**: L.

### 9.3 — Multiplayer 🔴
Yjs is already the document store, so the data layer is multiplayer-ready. Needs a sync server (y-websocket or similar), presence/awareness UI, and conflict-free annotations. **Effort**: XL — break down first.

### 9.4 — Collaborative annotations 🔴
The shared-comments version of 1.5's annotations. Part of the multiplayer epic.

---

## 10. Done — recently shipped

A short memory of what's already landed, so the backlog isn't mistaken for the whole picture.

- ✅ **Project scaffold** — Vite + React 19 + TS strict + Tailwind v4, feature-folder structure, wrapper-boundary ESLint rules.
- ✅ **Design system** — OKLCH tokens, golden-ratio macro layout, Neon + Michelin brands, theme runtime with persistence.
- ✅ **Schema** (v1.0.0) — Zod with cross-field invariants; parse boundary; example project.
- ✅ **Canvas** — React Flow wrapper, custom themed nodes with type glyphs + tone bars + MVP-introduced badges, themed controls/minimap.
- ✅ **ELK auto-layout in a Web Worker** — two-stage pipeline (auto-layout memoized on topology hash + cheap override merge), `elk-api` sub-worker pattern.
- ✅ **Layer toggle** — business / architecture / engineering, driven by the schema's layer list.
- ✅ **MVP slider** — single-point scrubbing with per-MVP signature colors; Framer Motion enter/exit on nodes.
- ✅ **Inspector** — global mode (project overview, MVP timeline, **working search**, **working diagnostics**, export placeholder) and element mode (overview, editable properties incl. nested paths, dependencies, live-status listing, history, doc/annotation placeholders).
- ✅ **Inline editing** — name, owner, description, and arbitrary scalar properties (incl. nested leaves) via click-to-edit, through DocStore mutations.
- ✅ **Drag-to-position** — per-layer position overrides; "Reorganize" to clear them.
- ✅ **Undo / redo** — Y.UndoManager with keyboard shortcuts and reactive enable/disable; close-together edits batch into one step.
- ✅ **File load** — example button, OS file picker, and window-level drag-drop, all through the parse boundary.
- ✅ **Save** — File System Access API with download fallback; dirty tracking.
- ✅ **Resizable + collapsible sidebar** — persisted width and visibility.
- ✅ **`.github/` + AI-agent files** — CONTRIBUTING, CODE_OF_CONDUCT, PR + issue templates, copilot-instructions, CI workflow, dependabot, CLAUDE.md, AGENTS.md.
- ✅ **Tests** — 19 unit tests across schema, resolve, and DocStore mutations.
