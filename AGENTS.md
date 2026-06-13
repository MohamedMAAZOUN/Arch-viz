# AGENTS.md

Universal instructions for AI coding agents working in this repository.

This file is the common-denominator format supported by multiple AI tools (Copilot CLI, Claude Code, Cursor, etc.). For tool-specific extras see [`CLAUDE.md`](./CLAUDE.md) and [`.github/copilot-instructions.md`](./.github/copilot-instructions.md). For the full human-facing standards, see [`docs/engineering-guide.md`](./docs/engineering-guide.md).

## Project

**arch-vis** is a frontend-only SPA for visualizing platform architectures across layers and time. Tech: Vite, React 19, TypeScript strict, Tailwind v4, React Flow, Yjs, ELK, Motion, Zustand, Zod. Node ≥ 20, pnpm ≥ 9.

## Run

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck
pnpm lint
pnpm test:run
pnpm build
```

All five must pass before opening a PR.

## Five non-negotiable principles

Every rule below descends from one of these. When rules conflict, reason from the principle.

1. **One source of truth** — `Y.Doc` (via `docStore`) for the draft; the loaded file for committed. No parallel copies of any field.
2. **Wrap external libraries** — `@xyflow/react`, `elkjs`, `yjs`, `y-indexeddb` each enter through exactly one file. Every other file talks to our wrapper interfaces.
3. **Render is a pure function** — `render(committedDoc, draftDoc, viewState) → DOM`. No side effects, no globals, no `Date.now()` inside render paths.
4. **Boundaries validate** — Zod at every entry point. Trusted thereafter; no re-validation deep in the call graph.
5. **Schema is law** — UI shapes itself to the schema. Change the schema first, then the UI.

## Hard rules

- **TypeScript strict** with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`. Never weaken.
- **No `any`**, no unexplained `as` casts (add a comment stating the safety argument), no `enum` (use string literal unions).
- **`readonly`** on function parameters, array fields, and return types wherever it's accurate.
- **Exhaustive switches** — when switching on a discriminated union, add `default: return assertNever(x)` from `@/core/errors` so new variants cause a compile error, not a silent gap.
- **Wrapper rule** — these libraries enter through exactly one file each:
  - `@xyflow/react` → `apps/web/src/features/canvas/Canvas.tsx` (+ node components in `apps/web/src/features/canvas/nodes/`)
  - `elkjs` → `apps/web/src/core/layout/ElkLayoutEngine.ts` and `apps/web/src/core/layout/layout.worker.ts`
  - `yjs` → `apps/web/src/core/doc/DocStore.ts`
  - `y-indexeddb` → `apps/web/src/core/doc/persistence.ts`
  - ESLint enforces this via `no-restricted-imports`. Do not suppress.
- **State tiers** — document data → Yjs (via `docStore`); view/UI state → Zustand stores in `apps/web/src/core/state/`; component-local → `useState`.
- **Loading a project** — always call `loadProject(project)` from `@/core/doc/loadProject`. It loads the doc AND resets view state so the canvas is never blank.
- **Schema first** — anything that requires schema changes must update `packages/schema/src/schema.ts` (including tests in `schema.test.ts`) before the UI.
- **Styling** — one component → one co-located `.css` file. All color/spacing/sizing/motion via `var(--…)` design tokens (`tokens.css` is the only place raw color is authored; JS mirror in `tokens.ts` — use `durationSec`/`ease`/`spring`). Layout is plain CSS (flex/grid), **not** Tailwind utilities. No hex/`oklch()` literals, no `var(--token, fallback)`. Enforced by `tokens.contract.test.ts`; see `docs/adr/0012-design-system-enforcement.md`.
- **`useEffect`** is for syncing with external systems only. Never derive state from any reactive value in an effect — use `useMemo` or compute at call sites.
- **Error handling** — expected failures (bad input, parse errors) return `Result<T, E>` from `@/core/errors`. Programming errors throw. Never `catch {}` silently.

## Repo map

```
architectures/             # bundled *.yaml projects, auto-discovered (⌘K switcher)
packages/
└── schema/                # @arch-vis/schema — Zod schema + parser + Result + safeUrl
                           # (shared contract; no React/DOM — see ADR 0014)
apps/
├── server/                # backend scaffold (Fastify + Drizzle + Postgres, issues #55+)
└── web/
    └── src/
        ├── App.tsx        # top-level composition
        ├── main.tsx       # entry point
        ├── bootstrap.ts   # loads the default architecture on startup
        ├── core/          # cross-cutting: doc, state, layout, errors, live, export
        ├── design-system/ # tokens (tokens.css/.ts), theme runtime, contract test
        ├── features/      # user-visible features (canvas, inspector, ...)
        ├── lib/           # pure utilities
        └── data/          # architecture catalog loader (architectures.ts)

docs/
├── engineering-guide.md   # canonical standards (read this)
├── dependency-study.md    # version-pinned bill of materials
├── schema-example.yaml    # docs copy of the example
└── adr/                   # architecture decision records
```

`core/` may not import from `features/`. `features/` may not import from sibling `features/`. Cross-feature communication goes through `core/state` and `core/doc`.

## Commits

Conventional Commits: `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`, `docs(scope): ...`, `test(scope): ...`, `chore(scope): ...`. One PR, one concern. Soft limit 400 LOC.

## Deferred — do not build without explicit user confirmation

These features are explicitly out of scope for v1 and must NOT be built speculatively,
even though the schema already contains types for some of them:

- Monaco YAML editor (plain textarea is sufficient for now)
- Multiplayer (Yjs is wired; needs a sync server)
- Video export of MVP transitions; PDF export (PNG/SVG already ship)
- A live-data proxy/backend (the http client ships; the proxy is a deploy concern)

> Note: guided **tour playback** (ADR 0004) and **live data** (ADR 0005/0008) are
> already implemented — they are no longer deferred.

## When uncertain

1. Search `docs/engineering-guide.md` for the rule.
2. Look at the closest existing feature in `src/features/` for the pattern.
3. If neither covers it, ask the user before inventing a new pattern.

If a rule blocks legitimate work, open an Architecture Decision Record (`docs/adr/NNNN-title.md`) proposing the change. Don't quietly bypass the rule.
