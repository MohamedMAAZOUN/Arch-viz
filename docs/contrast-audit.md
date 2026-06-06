# Contrast audit — new token combinations (issue #30)

Scope: the colour pairings added since the base palette — the **MVP lifecycle
badge**, the node's **type bar**, and the **tone** tokens used as text/indicators
— checked for **WCAG 2.x AA** across both themes (dark / light) and both brands
(neon / michelin).

## Method

Contrast is computed from the `oklch(...)` token strings directly:
`OKLCH → OKLab → linear sRGB → relative luminance → ratio`
(`src/design-system/contrast.ts`). Translucent foregrounds are composited over
their background first. The check is **automated** in
`src/design-system/contrast.test.ts`, so it re-runs whenever a token changes —
the token values there mirror `tokens.css`.

Thresholds:

- **4.5:1** — normal text (badge label, inspector tone text).
- **3:1** — large text and graphical UI components, WCAG 1.4.11 (the type bar).

Reference surface: `--color-bg-2` (the node body / card surface) per theme.

## Findings (before)

Dark theme passed comfortably everywhere. The **light theme** failed, because
the MVP and type palettes had **no light-theme override** — they kept their
~70–76 % lightness values, which are far too light against the light surface:

| Token group | Light-theme ratio (range) | Verdict |
|---|---|---|
| `--color-mvp-1..8` (badge) | 1.65 – 2.64 : 1 | ✗ fail |
| `--color-type-*` (type bar) | 1.97 – 3.40 : 1 | ✗ fail |
| `--color-tone-warning` (text) | 2.54 : 1 | ✗ fail |
| `--color-tone-success` (text) | 3.40 : 1 | ✗ fail (text) |
| `--color-tone-warning` michelin/light | 3.11 : 1 | ✗ fail |
| `--color-tone-critical` (text) | 4.52 : 1 | ✓ pass |

## Fixes

In `tokens.css`, under `[data-theme="light"]` (and the michelin/light brand
block):

- Added light-theme overrides for `--color-mvp-1..8` and `--color-type-*`,
  darkened to ~45–52 % lightness. MVP now clears **4.5:1**; the type bar clears
  **3:1** (most clear 4.5 too).
- Darkened `--color-tone-warning` (→ `52% 0.18 78`) and `--color-tone-success`
  (→ `50% 0.18 148`) so they clear **4.5:1** as text.
- Darkened the michelin light `--color-tone-warning` (→ `52% 0.2 50`).

Dark-theme tokens were already compliant and are unchanged.

## Result (after)

All audited combinations clear their threshold in dark **and** light, neon
**and** michelin. Locked by `contrast.test.ts`.

## Notes / not in scope

- The MVP **badge** renders the user's `mvp.color` from the YAML, not a token,
  so its contrast ultimately depends on user data; the token palette above is
  the recommended/compliant set used for overlay tinting and the slider/legend
  dots.
- Tone/MVP **dots** and the type bar are never the only signal — they always
  accompany a text label or badge — so they would be acceptable at 3:1; we hold
  the MVP/tone-text combinations to the stricter 4.5:1 anyway.
