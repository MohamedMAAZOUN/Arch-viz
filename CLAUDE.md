# CLAUDE.md

This file is the entry point for Claude Code working in this repository. Read it once at session start; everything else is on-demand.

## Project shape

**arch-vis** — a layered, time-aware platform diagramming tool. pnpm-workspace monorepo: `apps/web` (the SPA), `apps/server` (backend scaffold, ADR 0014), `packages/schema` (the shared Zod contract). The user loads a YAML project describing elements (services, databases, etc.) and connections; the app renders the graph and lets them browse it across business / architecture / engineering layers and scrub through MVP versions over time.

Tech: Vite 6 · React 19 · TypeScript 5.7 strict · Tailwind v4 (CSS-first @theme) · React Flow 12 (`@xyflow/react`) · Yjs 13 (draft state + undo/redo + IndexedDB persistence) · ELK.js (auto-layout, runs in a Web Worker) · Motion 12 · Zustand 5 · Zod 4.

## Where to look

- **Engineering rules**: `docs/engineering-guide.md` — the canonical standards. Read sections 1–6 before writing any code. Anti-patterns reference in § 17.
- **Schema**: `packages/schema/src/schema.ts` (`@arch-vis/schema`) — single source of truth for the project document shape. Prose reference (every field/enum/invariant) in `docs/schema-reference.md`; example in `architectures/example-project.yaml`.
- **ADRs**: `docs/adr/` — historical decisions. Add a new ADR before any change that contradicts a rule.
- **Design tokens**: `apps/web/src/design-system/tokens.css` (single source of truth) and `apps/web/src/design-system/tokens.ts` (JS mirror for Motion durations, z, breakpoints — use `durationSec`/`ease`/`spring` for Motion). **Styling model**: one component → one co-located `.css` file; all color/spacing/sizing/motion via `var(--…)` tokens; layout is plain CSS (flex/grid), **not** Tailwind utilities (Tailwind is only for `@theme`). `tokens.css` is the only place raw color is authored. Enforced by `apps/web/src/design-system/tokens.contract.test.ts`. See `docs/adr/0012-design-system-enforcement.md`.
- **Bundled architectures**: every `*.yaml` in the repo-root `architectures/` folder is auto-discovered (`apps/web/src/data/architectures.ts`, `import.meta.glob`) and listed in the ⌘K switcher (`features/architecture-picker`). Drop a file in = it appears; no registry. Default seed is `architectures/example-project.yaml`. See `docs/adr/0013-architecture-catalog.md`.

## The five non-negotiable principles

1. **One source of truth** — `Y.Doc` for the draft, file for the committed.
2. **Wrap external libraries** — `@xyflow/react`, `elkjs`, `yjs`, and `y-indexeddb` each enter through exactly one file. ESLint enforces this via `no-restricted-imports`. Do not suppress.
3. **Render is a pure function** — `render(committedDoc, draftDoc, viewState) → DOM`. No `localStorage` reads, `Date.now()`, or globals inside render paths.
4. **Boundaries validate** — Zod at every entrypoint. Trusted thereafter.
5. **Schema is law** — UI shapes itself to the schema. Schema change first, UI second.

## State tiers — getting this wrong is the #1 bug source

- **Document state** → `Y.Doc` via `docStore` operations. Touch `yjs` only in `apps/web/src/core/doc/DocStore.ts`.
- **View state** (layer, MVP, MVP mode, **cursor/pan-vs-select tool**, selection, viewport, **group expand/collapse**, **tour playback**) → Zustand stores in `apps/web/src/core/state/`.
- **Component-local state** → `useState`.

### Guided tours (playback)

`tours` in the schema are played by the `tour` feature. `tourStore` (view
state) holds `activeTourId` / `stepIndex` / `isPlaying`. The **Canvas** owns the
camera and node dimming (only it may touch React Flow): a pure
`resolveCameraAction(viewpoint)` decides `fitAll` / `focus` / `center` / `none`,
and the active step's `highlight` set dims everything else. `TourLauncher`
(picker) and `TourMount` → `TourPlayer` (overlay, lazy) are mounted from
`App.tsx`; the player owns the timer + keyboard. Entering a tour snapshots and
later restores the viewport/selection/layer/MVP. See
`docs/adr/0004-tour-playback.md`.

### Hierarchical containment (nested view)

Groups/parents render as nested React Flow sub-flows. The decision of what is
expanded vs collapsed is made in **one place — `resolve()`** — by merging:
- a **layer-driven default**: a `group` whose `aggregateAt` includes the
  current layer defaults to collapsed; everything else defaults to expanded;
- a **user override**: `viewStore.groupExpansion[elementId]` (set by the node
  chevron) always wins. Cleared on project load.

`resolve()` returns `elements`, real `connections` (inspector), canvas `edges`
(cross-boundary endpoints rerouted to the nearest visible ancestor), and a
`containment` map. The canvas (`Canvas.tsx`) maps an expanded element to a
`GroupNode` container and its children to `parentId`/`extent:"parent"` nodes;
a collapsed element is an `ElementNode` with a chevron. Nested ELK layout lives
in `layout.worker.ts` (`INCLUDE_CHILDREN`); the tree is built by
`buildLayoutTree.ts`. See `docs/adr/0003-nested-containment.md`.

The DocStore API surface (use these, don't reach into the Y.Doc):
- `docStore.get()` / `docStore.subscribe(handler)` / `docStore.dirty()`
- `docStore.commit()` / `docStore.discard()`
- `docStore.undo()` / `docStore.redo()` / `docStore.canUndo()` / `docStore.canRedo()`
- `docStore.updateElementName(id, name)`
- `docStore.updateElementProperty(id, key, value)` — pass `null` to remove the key
- `docStore.updateElementPropertyPath(id, path, value)`
- `docStore.updateElementDocumentation(id, markdown)` — pass `null` to clear
- `docStore.addAnnotation(id, annotation)` / `docStore.removeAnnotation(id, annotationId)`
- `docStore.updateConnectionProperty(id, edit)` — `edit` is a typed `ConnectionEdit` (`{ field: "type", value } | { field: "protocol", value }`); `protocol: null` clears it
- `docStore.addElement(element)` / `docStore.removeElement(id)` — remove cascades to the subtree, touching connections, and layout overrides
- `docStore.addConnection(connection)` / `docStore.removeConnection(id)`
- `docStore.setElementLayoutOverride(layer, elementId, position)` — pass `null` to clear
- `docStore.clearLayerOverrides(layer)`

New, fully-formed elements/connections are built by the pure factories in `@/core/doc/authoring` (`buildElement` / `buildConnection`) using `@/lib/id`. The "add element" palette (`features/element-editor`) and drag-to-connect on the canvas both go through them. Delete is available via the inspector Danger zone and the `Delete`/`Backspace` shortcut (`useDeleteSelectedShortcut`). The MVP slider has a single/overlay mode toggle (`viewStore.mvpMode`); overlay tints nodes by their introducing MVP and shows a legend.

**Loading a project**: always call `loadProject(project)` from `@/core/doc/loadProject` — it loads the doc AND resets the view (MVP, layer) so the canvas is never blank after load. Don't call `docStore.load()` directly from feature code.

For React, use the hooks: `useDocSnapshot()`, `useResolvedDoc()`, `useUndoRedoState()`.

## Folder rules

```
packages/
└── schema/       # @arch-vis/schema — Zod schema, parse, Result, safeUrl.
                  # Shared by web and server. No React/DOM (enforced by tsconfig).
apps/
├── server/       # backend (scaffold — filled by issues #55+, ADR 0014)
└── web/src/
    ├── core/         # cross-cutting. CANNOT import from features/
    ├── design-system/
    ├── features/     # user-visible features. CANNOT import from sibling features/
    ├── lib/          # pure utilities, no React, no state
    └── data/         # bundled data (example YAML)
```

Cross-feature communication flows through `core/state` and `core/doc`.
`Result`/`ok`/`err`/`unwrap` come from `@arch-vis/schema`, re-exported through
`@/core/errors` (which adds `assertNever`); web code keeps importing
`@/core/errors`. The schema and `parseProjectYaml` are imported directly from
`@arch-vis/schema`.

## Common operations

### Add a new element type to the schema

1. Update the `ElementType` enum and `Element` discriminated union in `packages/schema/src/schema.ts`.
2. Add a glyph case in `apps/web/src/features/canvas/nodes/NodeParts.tsx` → `ElementGlyph` (shared by `ElementNode` and `GroupNode`).
3. Add tone-aware styles in `ElementNode.css` if it has special visual treatment.
4. Update `packages/schema/src/schema.test.ts` to cover the new type.
5. Add an instance to `architectures/example-project.yaml` so manual QA covers it.
6. Bump `$schemaVersion` if the change isn't backward-compatible.
7. Update `NODE_DIMENSIONS` in `apps/web/src/features/canvas/types.ts` if the new type needs different dimensions.
8. The exhaustive switches in `Canvas.tsx` (`isAnimatedEdge`, `edgeStroke`) will produce compile errors if the new type also introduces a new `ConnectionType` — fix those too.

### Add a new feature

1. New folder under `apps/web/src/features/<feature-name>/`.
2. One component per file. Default export is the component.
3. Co-locate a `.css` file. All color/spacing/sizing/motion via `var(--…)` tokens; layout is plain CSS (flex/grid), not Tailwind utilities. Never author raw color outside `tokens.css`.
4. Mount the feature from `App.tsx` or another feature's composition root — never reach across siblings.
5. Cross-feature communication via `core/state` selectors or `core/doc` hooks.

### Run the toolchain

All commands run at the workspace root and fan out to every package
(`pnpm -r`); `dev`/`test` target `@arch-vis/web`.

```bash
pnpm dev          # http://localhost:5173
pnpm typecheck    # zero errors required (web + server + schema)
pnpm lint         # zero errors required
pnpm test         # vitest watch (web)
pnpm test:run     # one-shot for CI (all packages)
pnpm build        # production build
```

## Style cheatsheet

- TypeScript strict, zero `any`, no unexplained `as` casts (add a comment explaining the safety argument).
- `readonly` on parameters, arrays, and return types wherever it's accurate.
- Exhaustive discriminated-union switches: `default: return assertNever(x)` from `@/core/errors`.
- Function components, hooks named `use*`.
- Props destructured at signature.
- Discriminated unions over boolean flags. String literal unions over `enum`.
- `useEffect` only for syncing with external systems (subscriptions, focus, scroll). Never for derived state — derived state from *any* reactive value (props, state, store) belongs in `useMemo` or at the call site.
- Zod for validation at all I/O boundaries. `Result<T, E>` (from `@/core/errors`) for expected failures; `throw` for invariant violations. Never `catch {}`.
- No hex colors, no magic px/ms values in component code — use design tokens.

## When something feels off

- An ESLint rule is blocking you → open an ADR, don't suppress.
- A library doesn't fit cleanly → wrap it (see existing wrappers as templates).
- The schema can't express your feature → schema change first.
- The engineering guide is wrong → fix the guide in the same PR.

## Testing conventions

- Unit tests live **next to the code** they test (`Foo.ts` ↔ `Foo.test.ts`). The `tests/` folder is for E2E only.
- Never mock the schema — use the real Zod parser in every test.
- Assert behavior, not implementation details.
- `Result` helpers and DocStore mutations each need direct tests in `core/`.

## Live data & export

- **Live data** (`apps/web/src/core/live/`): only `http` `dataSources` are polled, through
  one boundary — `LiveDataClient` (direct browser fetch). Polling is **opt-in per
  project** (`viewStore.liveDataEnabled`, reset on every load) so an untrusted
  imported document never auto-fetches; every URL must be a public http(s)
  endpoint (`isPublicHttpUrl` in `@/lib/safeUrl`, enforced in the schema and
  re-checked before fetch). `grafana`/`jira` sources are **link buttons** (open a
  page in a new tab), never fetched — no proxy, no token. The
  `useLiveData(element)` hook (backoff + stale states) feeds the node
  `LiveIndicator` and the inspector's Live status. See
  `docs/adr/0005-live-data.md` and `docs/adr/0008-live-data-hardening.md`.
- **Export** (`apps/web/src/core/export/`): JSON via `serializeProject` (round-trips);
  PNG/SVG via the Canvas-registered `canvasExporter` (lazy `html-to-image`,
  captures the visible graph at the current layer + MVP). UI in
  `inspector/sections/ExportSection`. See `docs/adr/0006-export.md`.

## Backend roadmap (planned — ADR 0014)

A backend is planned and designed: Node 20 + Fastify + Drizzle + Postgres +
Hocuspocus, pnpm-workspace monorepo (`apps/web`, `apps/server`,
`packages/schema`), dual auth (local + ForgeRock OIDC with lazy user
creation), guest mode preserved, owner/viewer/editor sharing, append-only
commit snapshots, multiplayer via Yjs sync. See `docs/adr/0014-backend.md`
and GitHub issues #53–#69 (milestones 0–5, dependency-ordered). Formerly
deferred items now live on that roadmap: multiplayer (#65), collaborative
annotations (#67), Monaco YAML editor (#68), video export of MVP transitions
(#69).

**Cancelled, not deferred**: the live-data proxy. `grafana`/`jira` data
sources are link buttons permanently; only the existing opt-in client-side
`http` polling fetches anything.

Still genuinely deferred (don't build without confirming): PDF export
(after PNG).
