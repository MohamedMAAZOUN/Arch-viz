# Copilot instructions for arch-vis

These instructions apply to every Copilot interaction in this repository.

## Project

This is **arch-vis**, an architecture-visualization tool. pnpm-workspace monorepo: `apps/web` (Vite + React 19 + TypeScript 5.7 + Tailwind v4 + React Flow + Yjs + ELK.js + Motion SPA), `apps/server` (backend scaffold — Fastify + Drizzle + Postgres, ADR 0014), and `packages/schema` (`@arch-vis/schema`, the shared Zod contract; no React/DOM). The full design and rationale lives in `docs/engineering-guide.md` — defer to that file whenever it conflicts with anything here. **Read sections 1–6 of the engineering guide before writing any code.**

## Mandatory rules

- Use TypeScript with strict flags. Never disable `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, or `noPropertyAccessFromIndexSignature`.
- Never use `any`. Use `unknown` plus narrowing.
- Never write `as` casts without an explanatory comment.
- Never use `enum`. Use string literal unions.
- Never use `useEffect` to derive state from any reactive value (props, state, store). Derive via `useMemo` or at call sites.
- Never import `@xyflow/react` outside `apps/web/src/features/canvas/Canvas.tsx` and `apps/web/src/features/canvas/nodes/`.
- Never import `elkjs` outside `apps/web/src/core/layout/ElkLayoutEngine.ts` and `apps/web/src/core/layout/layout.worker.ts`.
- Never import `yjs` outside `apps/web/src/core/doc/DocStore.ts`.
- Never import `y-indexeddb` outside `apps/web/src/core/doc/persistence.ts`.
- Never use hex colors or hardcoded pixel spacing in components. Use the design tokens in `apps/web/src/design-system/tokens.css` and `apps/web/src/design-system/tokens.ts`.
- Never write `outline: none` on a focusable element without a replacement focus indicator.

## State

Three tiers. Putting state in the wrong tier is the #1 source of bugs:

- **Document state** (elements, connections, lifecycle, properties, layout overrides) → `Y.Doc` via `docStore` operations only.
- **View state** (current layer, current MVP, selected element, viewport, inspector visibility) → Zustand stores under `apps/web/src/core/state/`.
- **Component-local state** (popover open, form draft) → `useState`.

## Zod schema

`packages/schema/src/schema.ts` (imported as `@arch-vis/schema`) is the contract, shared by the web app and the server. UI shapes itself to the schema. A new feature that requires schema changes must update the schema (including version, validation, cross-field invariants) **before** the UI is built. Test additions belong in `packages/schema/src/schema.test.ts`.

## React patterns

- Function components only.
- One component per file.
- Destructure props at the signature.
- Custom hooks start with `use`.
- Memoize only when a profiler shows a real cost or a `React.memo` child needs reference stability.

## Errors

Two categories:

- **Expected failures** (bad input, parse error, network fail) → return `Result<T, E>` from `@/core/errors`.
- **Programming errors** (broken invariant, "this should never happen") → throw. Let an error boundary catch it.

Never swallow errors silently with `catch {}`.

## Styling

- **One component → one co-located `.css` file.** Style via `className`; reserve
  inline `style={{}}` for dynamic, data-driven values only.
- **Everything visual goes through design tokens** (CSS custom properties in
  `apps/web/src/design-system/tokens.css`): color, spacing (`var(--space-*)`), sizing
  (`var(--size-*)`), radius, elevation, motion, z-index.
- **Layout is plain CSS (flex/grid), NOT Tailwind utilities.** There are no
  Tailwind utility classes in this repo; Tailwind v4 exists only for the `@theme`
  block. Do not add `p-4`/`gap-3`-style classes.
- **`tokens.css` is the only place raw color is authored.** Never write a hex or
  `oklch()`/`rgb()` literal in component CSS — use a `var(--color-…)` token. Never
  use `var(--token, fallback)`.
- Motion durations/easings come from `apps/web/src/design-system/tokens.ts` (`durationSec`,
  `ease`, `spring`), not raw numbers. `prefers-reduced-motion` zeroing happens at
  the token layer — don't add per-component handling.
- Enforced by `apps/web/src/design-system/tokens.contract.test.ts` (runs in CI). See
  `docs/adr/0012-design-system-enforcement.md`.

## Commits & PRs

- Conventional Commits format: `type(scope): description`.
- One PR, one concern.
- Soft limit: 400 LOC changed.
- See `.github/PULL_REQUEST_TEMPLATE.md`.

## Roadmap features — do not build ahead of their issue

The backend roadmap (ADR 0014, issues #53–#69) covers: server scaffold, dual
auth (local + ForgeRock OIDC), project catalog + sharing, snapshot history,
multiplayer (Hocuspocus), collaborative annotations, Monaco YAML editor, and
video export. Build them only through their issue, in dependency order.

**Cancelled, never build**: a live-data proxy. `grafana`/`jira` data sources
are link buttons permanently; only the existing opt-in client-side `http`
polling fetches anything.

Still deferred (don't build without confirming): PDF export (after PNG).

> Tour playback (ADR 0004) and live data (ADR 0005/0008) are already implemented — no longer deferred.

## When you don't know something

Search `docs/engineering-guide.md` first. Then look at the most-similar existing feature in `apps/web/src/features/` for the established pattern. Don't invent a new pattern when an existing one applies.

If a rule blocks legitimate work, open an Architecture Decision Record in `docs/adr/NNNN-title.md` proposing the change rather than quietly bypassing the rule.
