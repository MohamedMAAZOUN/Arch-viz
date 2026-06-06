# `core/` — cross-cutting infrastructure

Everything the whole app depends on but that isn't a user-visible feature: the
document model, validation, state stores, layout, and the small primitives the
features build on.

## The one import rule

**`core/` MUST NOT import from `features/`.** Dependencies point one way:
`features/ → core/`, never back. Cross-feature communication flows _through_
`core/state` and `core/doc`, so anything shared lands here. (ESLint enforces the
direction.)

## What's in here

| Folder    | Responsibility                                                                                           | Wraps                  |
| --------- | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| `schema/` | Zod definitions for the project document + the parse trust boundary. **Schema is law.**                  | `zod`                  |
| `doc/`    | The `Y.Doc` source of truth: `DocStore` operations, `resolve()`, authoring factories, doc-reading hooks. | `yjs`, `y-indexeddb`   |
| `state/`  | Zustand view-state stores (`viewStore`, `selectionStore`, `tourStore`, …).                               | `zustand`              |
| `layout/` | Auto-layout: the `LayoutEngine` contract + the ELK Web Worker.                                           | `elkjs`                |
| `live/`   | Live-data polling through the one `LiveDataClient` boundary.                                             | —                      |
| `export/` | Project serialization (JSON) + the Canvas-registered image exporter.                                     | `html-to-image` (lazy) |
| `errors/` | `Result<T, E>` type and helpers; `assertNever`. No throwing for _expected_ failures.                     | —                      |
| `a11y/`   | Accessibility primitives (focus trap, …).                                                                | —                      |

## Wrapper boundaries

Four libraries enter the codebase through exactly one file each — all under
`core/` except the canvas:

- `yjs` / `y-indexeddb` → `doc/DocStore.ts`, `doc/persistence.ts`
- `elkjs` → `layout/layout.worker.ts` (see `docs/adr/0008-layout-in-worker.md`)
- `zod` → `schema/schema.ts`
- (`@xyflow/react` is wrapped in `features/canvas/Canvas.tsx`, not here)

If a new external library needs wrapping, add the wrapper **and** the
`no-restricted-imports` rule before any feature uses it. Don't suppress the rule
— open an ADR instead.

## Reading the document from React

`useDocSnapshot()` is the canonical hook for the raw document; `useResolvedDoc()`
gives the inheritance/override-resolved view; `useDirty()` is the reactive
draft-vs-committed flag. Don't add new ad-hoc `docStore.subscribe()` hooks.

## Key ADRs

- `0009-two-stage-layout.md` — auto-layout + override merge
- `0010-state-tiers.md` — document / view / local split
- `0011-per-layer-overrides.md` — per-layer manual positions
- `0005-live-data.md` · `0006-export.md`
