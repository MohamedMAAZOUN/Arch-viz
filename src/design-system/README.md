# `design-system/` — tokens, theme runtime, and primitives

The single source of visual truth. Colors, motion, spacing-as-tokens, and the
theme/brand runtime live here so the rest of the app never hardcodes a hex or a
magic millisecond.

## The one styling rule

**Theming travels through CSS variables. Layout travels through Tailwind
utilities.**

- A value that changes with theme or brand (any color, certain shadows/borders)
  → CSS variable: `var(--color-bg-2)`.
- A structural value (padding, gap, grid, flex) → Tailwind utility: `p-4`,
  `gap-3`.

No hex colors and no magic px/ms in component code — reference a token.

## Files

| File               | Role                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.css`       | **Source of truth** for every design token (`@theme`, CSS custom properties). Imported before any feature CSS.                                                  |
| `tokens.ts`        | JS mirror of the tokens that JS needs — Motion durations/easings, etc. Keep in sync with `tokens.css`.                                                          |
| `theme.ts`         | Theme + brand runtime: applies the persisted theme/brand to the document root (the anti-flash inline script in `index.html` runs the first apply before paint). |
| `contrast.ts`      | WCAG contrast helpers used to keep token pairings accessible.                                                                                                   |
| `contrast.test.ts` | Guards the token palette against contrast regressions.                                                                                                          |

## Why two token files

`tokens.css` is authoritative — CSS owns the cascade and theming. `tokens.ts`
exists only because some values (animation timings consumed by Motion) have to be
read from JS. When a token is needed in both worlds, define it in `tokens.css`
and mirror the specific value into `tokens.ts`; never let JS invent its own.

## Adding or changing a token

1. Add/edit the custom property in `tokens.css`.
2. If JS consumes it, mirror it in `tokens.ts`.
3. If it's a color pairing, make sure `contrast.test.ts` still passes.
4. Reference it from components as `var(--…)` — never inline the literal.

See `docs/engineering-guide.md` § 6 (Styling) and `docs/contrast-audit.md`.
