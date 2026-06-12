# `design-system/` — tokens, theme runtime, and enforcement

The single source of visual truth. Colors, motion, spacing, sizing, and the
theme/brand runtime live here so the rest of the app never hardcodes a hex or a
magic millisecond.

## The styling model

**One component → one co-located `.css` file.** Style components via `className`
(reserve inline `style={{}}` for dynamic, data-driven values). Everything visual
flows through **design tokens** — CSS custom properties defined in `tokens.css`:

| Concern                      | Token family                       | Example                         |
| ---------------------------- | ---------------------------------- | ------------------------------- |
| Color / shadow / border      | `--color-*`, `--elevation-*`       | `var(--color-bg-2)`             |
| Spacing & layout (flex/grid) | `--space-*`                        | `gap: var(--space-3)`           |
| Sizing (reused controls)     | `--size-*`                         | `width: var(--size-control-sm)` |
| Radius / type                | `--radius-*`, `--text-*`           | `var(--radius-md)`              |
| Motion / z-index             | `--duration-*`/`--ease-*`, `--z-*` | `var(--z-dialog)`               |

**Layout is plain CSS, not Tailwind utilities.** Tailwind v4 is present _only_ to
power the `@theme` block that registers the tokens — there are no `p-4`/`gap-3`
utility classes in this repo. **`tokens.css` is the only file that authors raw
color**; everywhere else, color is a `var(--color-…)` token. Never use
`var(--token, fallback)` — a fallback hides a missing token.

## Files

| File                       | Role                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.css`               | **Source of truth** for every design token (`@theme` + theme/brand overrides). Imported before any feature CSS.                                                     |
| `tokens.ts`                | JS mirror of tokens JS needs — Motion durations (`duration`, `durationSec`), `ease`, `spring`, `z`, `breakpoint`.                                                   |
| `theme.ts`                 | Theme + brand runtime: applies/persists the choice; anti-flash inline script in `index.html` runs the first apply.                                                  |
| `contrast.ts` / `.test.ts` | WCAG contrast helpers + a test guarding token pairings against contrast regressions.                                                                                |
| `tokens.contract.test.ts`  | **Guardrail.** Fails CI on undefined tokens; raw colors, font/line/letter/radius/timing/z-index literals outside `tokens.css`; and `tokens.ts`↔`tokens.css` drift. |

## Motion

Use `durationSec` (seconds) so no call site writes `/ 1000`:

```ts
import { durationSec, ease, spring } from "@/design-system/tokens";

<motion.div transition={{ duration: durationSec.base, ease: ease.out }} />
<motion.div transition={spring.snappy} />
```

`prefers-reduced-motion` is respected at the token layer (durations zero out).
Don't add per-component reduced-motion handling.

## Why two token files

`tokens.css` is authoritative — CSS owns the cascade and theming. `tokens.ts`
exists only because some values (Motion timings, z-index, breakpoints used in
`matchMedia`) must be read from JS. When a token is needed in both worlds, define
it in `tokens.css` and mirror the value into `tokens.ts`; the contract test
asserts they match.

## Adding or changing a token

1. Add/edit the custom property in `tokens.css`.
2. If JS consumes it, mirror it in `tokens.ts` (the contract test enforces sync).
3. If it's a color pairing, make sure `contrast.test.ts` still passes.
4. Reference it from components as `var(--…)` — never inline the literal.

The contract test then guarantees every `var(--…)` reference resolves and that no
raw color slipped into feature CSS. See
[`docs/adr/0012-design-system-enforcement.md`](../../docs/adr/0012-design-system-enforcement.md),
`docs/engineering-guide.md` §6, and `docs/contrast-audit.md`.
