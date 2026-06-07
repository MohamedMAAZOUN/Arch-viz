# ADR 0012 — Design-system enforcement & the real styling model

- **Status**: Accepted
- **Date**: 2026-06-07
- **Supersedes**: the styling guidance in earlier revisions of
  `docs/engineering-guide.md` §6 and `.github/copilot-instructions.md`.

## Context

The token layer (`src/design-system/tokens.css` + `tokens.ts`) is strong and
authoritative, but two problems had crept in:

1. **The documented styling model didn't match the code.** The guides said
   "layout travels through Tailwind utilities (`p-4`, `gap-3`)" and referenced
   shadcn/ui primitives. In reality there are **zero** Tailwind utility classes
   and **no** shadcn in the codebase — every component uses a **co-located CSS
   file** that consumes tokens via `var(--…)`. Tailwind v4 is present **only** to
   power the `@theme` block that registers the tokens.
2. **The rules were convention-only.** Nothing failed the build when a component
   bypassed the system. This had already produced a silent bug: a
   `var(--color-accent-fg)` reference (the real token is `--color-accent-fg-on`)
   that resolved to nothing and fell back to the wrong color.

## Decision

### 1. The styling model, stated accurately

- **One component → one co-located `.css` file.** Theming, spacing, sizing,
  radius, elevation, motion, and z-index all flow through **CSS custom
  properties** defined in `tokens.css`.
- **Layout is plain CSS** (flex/grid) using spacing tokens (`var(--space-*)`),
  **not** Tailwind utilities.
- **Tailwind's role is the `@theme` block only.** Do not add utility classes;
  if that ever changes, it needs its own ADR.
- **`tokens.css` is the single place raw color is authored.** Everywhere else,
  color comes from a token. Structural hairlines (`1px`/`2px` borders, etc.) may
  stay literal; *repeated* control dimensions get a `--size-*` token.

### 2. Centralize what was scattered

New tokens added so nothing is hand-duplicated:

- `--color-scrim`, `--color-inset-highlight` — overlay primitives (were copied
  as raw `oklch()` across 6 files).
- `--size-control-xs|sm|md`, `--size-dot` — reused control dimensions.
- `--brand-{neon,michelin}-{from,to}` — fixed brand-preview swatches (the only
  place that legitimately needs brand colors regardless of the active brand).
- `durationSec` and `spring.snappy` in `tokens.ts` — so Motion call sites stop
  hand-writing `duration.x / 1000` and ad-hoc spring/duration literals.

### 3. Enforce it with a test, not a new tool

`src/design-system/tokens.contract.test.ts` runs in `pnpm test` / CI and asserts:

1. **Every `var(--token)` referenced in any CSS is defined** (catches typos and
   deleted tokens — the class of bug above).
2. **No raw color literals outside `tokens.css`** (`oklch()`, `rgb()`, hex, …).
3. **`tokens.ts` mirrors `tokens.css`** for durations, z-index, breakpoints, and
   the MVP palette — the values that must live in both worlds.

We chose a vitest contract over stylelint deliberately: it needs no extra
dependency, lives beside the system it guards, and already runs in CI. The test
reads CSS from disk with `fs` (not `import.meta.glob(...?raw)`) because the
vitest config sets `css: false`, which makes raw CSS imports resolve to empty
strings.

## Consequences

- Contributors get a fast, local failure when they bypass tokens — the system
  is now a contract, not a guideline.
- Adding a token is unchanged (edit `tokens.css`; mirror into `tokens.ts` only if
  JS needs it; keep `contrast.test.ts` green). The contract test then guarantees
  references resolve and the mirror stays in sync.
- The guides, `CLAUDE.md`, `AGENTS.md`, and `.github/copilot-instructions.md`
  were updated to describe the co-located-CSS model (no Tailwind utilities, no
  shadcn).
