# Contributing to Architecture Visualizer

Thanks for your interest. This project follows a strict set of conventions to stay coherent at scale; please skim them before opening a PR.

## Quickstart

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # vitest watch mode
pnpm test:run     # one-shot for CI
pnpm typecheck
pnpm lint
pnpm build
```

Node ≥ 20, pnpm ≥ 9.

## The five non-negotiable principles

1. **One source of truth** — `Y.Doc` for the draft, file for the committed. No parallel state.
2. **Wrap external libraries** — `@xyflow/react`, `elkjs`, `yjs` each enter through exactly one file (Canvas.tsx, ElkLayoutEngine.ts / layout.worker.ts, DocStore.ts / persistence.ts). ESLint enforces this with `no-restricted-imports`. Don't suppress it.
3. **Render is a pure function** — `render(committedDoc, draftDoc, viewState) → DOM`. No reads from `localStorage`, `Date.now()`, or globals inside render paths.
4. **Boundaries validate** — Zod at every entrypoint (file load, future API, URL params). Trusted thereafter.
5. **Schema is law** — UI shapes itself to the schema, never the other way around. New feature → update `src/core/schema/schema.ts` first, then the UI.

Full rules: **[`docs/engineering-guide.md`](../docs/engineering-guide.md)**. Read it before contributing anything beyond a typo fix.

## Repository structure

```
src/
├── core/         # cross-cutting infrastructure (schema, doc, state, layout, errors)
├── design-system/# tokens, theme runtime, primitives
├── features/     # user-visible capabilities (canvas, inspector, mvp-slider, ...)
├── lib/          # tiny pure utilities (no React, no state)
└── data/         # bundled example data
```

`core/` cannot import from `features/`. `features/` cannot import from sibling `features/`. Cross-feature communication goes through `core/state` and `core/doc`.

## Pull requests

- **One PR, one concern.** Refactor + feature = two PRs.
- **400 LOC soft limit.** Split larger work.
- **Conventional Commits** for the title: `feat(canvas): ...`, `fix(doc): ...`, etc.
- **Pass CI**: typecheck, lint, tests, build, bundle budget.
- **Self-review the diff before requesting a review.**

A PR template is provided.

## Bug reports & features

- **Bug?** Use the bug report template. Include reproduction steps, browser/OS, and a screenshot of the canvas when relevant.
- **Feature?** Use the feature request template. Reference the schema if the feature requires schema changes (because it usually does).

## Architectural changes

Anything that changes a rule in the engineering guide, swaps a wrapped library, or alters the schema in a breaking way requires an **Architecture Decision Record** (`docs/adr/NNNN-title.md`) accepted before merge. The format lives in `docs/engineering-guide.md` § 16.

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). In short: be kind, be specific, and assume good intent.
