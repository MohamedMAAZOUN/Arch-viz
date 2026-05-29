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

## Hard rules

- **TypeScript strict** with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`. Never weaken.
- **No `any`**, no unexplained `as` casts, no `enum` (use string literal unions).
- **Wrapper rule** — these libraries enter through exactly one file each:
  - `@xyflow/react` → `src/features/canvas/Canvas.tsx` (+ node components in `src/features/canvas/nodes/`)
  - `elkjs` → `src/core/layout/ElkLayoutEngine.ts` and `src/core/layout/layout.worker.ts`
  - `yjs` → `src/core/doc/DocStore.ts`
  - `y-indexeddb` → `src/core/doc/persistence.ts`
  - ESLint enforces this via `no-restricted-imports`. Do not suppress.
- **State tiers** — document data → Yjs (via `docStore`); view/UI state → Zustand stores in `src/core/state/`; component-local → `useState`.
- **Schema first** — anything that requires schema changes must update `src/core/schema/schema.ts` (including tests in `schema.test.ts`) before the UI.
- **Theming** — colors and motion via design tokens (CSS variables in `tokens.css`, JS mirror in `tokens.ts`). Never hex literals, never magic ms.
- **`useEffect`** is for syncing with external systems only. Never derive state in an effect.

## Repo map

```
src/
├── App.tsx                # top-level composition
├── main.tsx               # entry point
├── bootstrap.ts           # loads example on startup
├── core/                  # cross-cutting: schema, doc, state, layout, errors
├── design-system/         # tokens, theme runtime
├── features/              # user-visible features (canvas, inspector, ...)
├── lib/                   # pure utilities
└── data/                  # bundled example YAML

docs/
├── engineering-guide.md   # canonical standards (read this)
├── dependency-study.md    # version-pinned bill of materials
├── schema-example.yaml    # docs copy of the example
└── adr/                   # architecture decision records
```

`core/` may not import from `features/`. `features/` may not import from sibling `features/`. Cross-feature communication goes through `core/state` and `core/doc`.

## Commits

Conventional Commits: `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`, `docs(scope): ...`, `test(scope): ...`, `chore(scope): ...`. One PR, one concern. Soft limit 400 LOC.

## When uncertain

1. Search `docs/engineering-guide.md` for the rule.
2. Look at the closest existing feature in `src/features/` for the pattern.
3. If neither covers it, ask the user before inventing a new pattern.

If a rule blocks legitimate work, open an Architecture Decision Record (`docs/adr/NNNN-title.md`) proposing the change. Don't quietly bypass the rule.
