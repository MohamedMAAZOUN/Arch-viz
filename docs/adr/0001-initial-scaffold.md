# ADR-0001 — Initial scaffold and stack lock-in

## Status

Accepted · May 18, 2026

## Context

After the design phase (schema v1.0.0, dependency study, design system with Neon + Michelin brands, engineering guide), we needed to choose the concrete project shape and dependency versions to begin implementation.

## Decision

- **Build tool**: Vite 6 with React plugin and the Tailwind v4 plugin.
- **Language**: TypeScript 5.7 with strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, and the other flags enumerated in the engineering guide.
- **Package manager**: pnpm 9 (workspaces-ready for a future server package).
- **Path alias**: `@/*` → `src/*`.
- **Folder structure**: organized by feature, with a `core/` for cross-cutting infrastructure. `core/` cannot import from `features/`.
- **Library versions**: pinned exactly per the dependency study. React 19, @xyflow/react 12.10.2, yjs 13.6.30, motion 12.38.0, zustand 5.0.13, zod 4.4.3, elkjs 0.11.1, tailwindcss 4.0.0.
- **ESLint v9 flat config** enforces wrapper boundaries: imports of `@xyflow/react`, `elkjs`, `yjs`, and `y-indexeddb` are restricted to their designated wrapper files via the `no-restricted-imports` rule. Tests are exempted.
- **Tokens-first styling**: the design system's `tokens.css` is imported before any feature CSS. Components reference CSS variables for colors / motion / spacing-via-tokens; Tailwind utilities cover layout primitives.
- **Anti-flash inline script** in `index.html` runs before paint to apply persisted theme + brand from localStorage.

## Consequences

What gets easier:
- New features start in a `src/features/<name>/` folder with clear conventions.
- Swapping any wrapped library means changing one file plus an ESLint update.
- Theme + brand switching is centralized in `design-system/theme.ts`.

What gets harder:
- Adding a new external library that needs wrapping requires updating ESLint and writing the wrapper before any feature can use it. Intentional friction.
- Cross-feature communication must go through `core/state`, not direct imports. Will frustrate ad-hoc fixes; prevents accidental coupling.

What we're committed to:
- The five principles in the engineering guide.
- The schema v1.0.0 shape (see `src/core/schema/schema.ts`).
- The design system v1.0.0 tokens.

## Alternatives considered

- **Next.js / Remix** instead of Vite: rejected — we don't need SSR for a frontend-only SPA in v1, and Vite's dev server is faster.
- **Bun** as runtime/package manager: rejected — pnpm is more mature, Bun's lockfile churn is still high in mid-2026.
- **Organized by layer** (`components/`, `hooks/`, `utils/`) instead of feature: rejected — leads to "shotgun" PRs that touch ten files for one feature, and obscures ownership.
