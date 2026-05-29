# CLAUDE.md

This file is the entry point for Claude Code working in this repository. Read it once at session start; everything else is on-demand.

## Project shape

**arch-vis** — a layered, time-aware platform diagramming tool. Frontend-only SPA. The user loads a YAML project describing elements (services, databases, etc.) and connections; the app renders the graph and lets them browse it across business / architecture / engineering layers and scrub through MVP versions over time.

Tech: Vite 6 · React 19 · TypeScript 5.7 strict · Tailwind v4 (CSS-first @theme) · React Flow 12 (`@xyflow/react`) · Yjs 13 (draft state + undo/redo + IndexedDB persistence) · ELK.js (auto-layout, runs in a Web Worker) · Motion 12 · Zustand 5 · Zod 4.

## Where to look

- **Engineering rules**: `docs/engineering-guide.md` — the canonical standards. Read sections 1–6 before writing any code. Anti-patterns reference in § 17.
- **Schema**: `src/core/schema/schema.ts` — single source of truth for the project document shape. Example in `src/data/example-project.yaml`.
- **ADRs**: `docs/adr/` — historical decisions. Add a new ADR before any change that contradicts a rule.
- **Design tokens**: `src/design-system/tokens.css` (single source of truth) and `src/design-system/tokens.ts` (JS mirror for Motion durations etc.).

## The five non-negotiable principles

1. **One source of truth** — `Y.Doc` for the draft, file for the committed.
2. **Wrap external libraries** — `@xyflow/react`, `elkjs`, `yjs`, and `y-indexeddb` each enter through exactly one file. ESLint enforces this via `no-restricted-imports`. Do not suppress.
3. **Render is a pure function** — `render(committedDoc, draftDoc, viewState) → DOM`. No `localStorage` reads, `Date.now()`, or globals inside render paths.
4. **Boundaries validate** — Zod at every entrypoint. Trusted thereafter.
5. **Schema is law** — UI shapes itself to the schema. Schema change first, UI second.

## State tiers — getting this wrong is the #1 bug source

- **Document state** → `Y.Doc` via `docStore` operations. Touch `yjs` only in `src/core/doc/DocStore.ts`.
- **View state** (layer, MVP, selection, viewport) → Zustand stores in `src/core/state/`.
- **Component-local state** → `useState`.

The DocStore API surface (use these, don't reach into the Y.Doc):
- `docStore.get()` / `docStore.subscribe(handler)` / `docStore.dirty()`
- `docStore.commit()` / `docStore.discard()`
- `docStore.undo()` / `docStore.redo()` / `docStore.canUndo()` / `docStore.canRedo()`
- `docStore.updateElementName(id, name)`
- `docStore.updateElementProperty(id, key, value)` — pass `null` to remove the key
- `docStore.updateElementPropertyPath(id, path, value)`
- `docStore.updateConnectionProperty(id, key, value)`
- `docStore.setElementLayoutOverride(layer, elementId, position)` — pass `null` to clear
- `docStore.clearLayerOverrides(layer)`

**Loading a project**: always call `loadProject(project)` from `@/core/doc/loadProject` — it loads the doc AND resets the view (MVP, layer) so the canvas is never blank after load. Don't call `docStore.load()` directly from feature code.

For React, use the hooks: `useDocSnapshot()`, `useResolvedDoc()`, `useUndoRedoState()`.

## Folder rules

```
src/
├── core/         # cross-cutting. CANNOT import from features/
├── design-system/
├── features/     # user-visible features. CANNOT import from sibling features/
├── lib/          # pure utilities, no React, no state
└── data/         # bundled data (example YAML)
```

Cross-feature communication flows through `core/state` and `core/doc`.

## Common operations

### Add a new element type to the schema

1. Update the `ElementType` enum and `Element` discriminated union in `src/core/schema/schema.ts`.
2. Add a glyph case in `src/features/canvas/nodes/ElementNode.tsx` → `ElementGlyph`.
3. Add tone-aware styles in `ElementNode.css` if it has special visual treatment.
4. Update `src/core/schema/schema.test.ts` to cover the new type.
5. Add an instance to `src/data/example-project.yaml` so manual QA covers it.
6. Bump `$schemaVersion` if the change isn't backward-compatible.
7. Update `NODE_DIMENSIONS` in `src/features/canvas/types.ts` if the new type needs different dimensions.
8. The exhaustive switches in `Canvas.tsx` (`isAnimatedEdge`, `edgeStroke`) will produce compile errors if the new type also introduces a new `ConnectionType` — fix those too.

### Add a new feature

1. New folder under `src/features/<feature-name>/`.
2. One component per file. Default export is the component.
3. Co-locate the CSS file. Theming via CSS variables, layout via Tailwind utilities.
4. Mount the feature from `App.tsx` or another feature's composition root — never reach across siblings.
5. Cross-feature communication via `core/state` selectors or `core/doc` hooks.

### Run the toolchain

```bash
pnpm dev          # http://localhost:5173
pnpm typecheck    # zero errors required
pnpm lint         # zero errors required
pnpm test         # vitest watch
pnpm test:run     # one-shot for CI
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

## Things deferred to v1.5+

- Monaco YAML editor (currently a plain textarea is good enough when needed)
- Multiplayer (Yjs is wired, just needs a sync server)
- Tour mode playback
- Video export of MVP transitions
- Live data hooks (Grafana / Jira fetching)

Don't build these without confirming with the user. They're explicitly deferred.
