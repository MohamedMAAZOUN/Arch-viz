# `docs/media/` — README screenshots & GIFs

Visual assets embedded in the top-level `README.md`. Committed as binaries so the
GitHub README renders them without a build step.

> **Status:** placeholders. The capture step is automated but the images are
> generated locally (this repo's CI/agents have no browser binaries). Run the
> script below and commit the output once the UI is visually stable.

## Expected files

The README references these paths — generate them with the matching names:

| File | What it shows |
|---|---|
| `layer-business.png` | The seeded example at the **business** layer. |
| `layer-architecture.png` | …at the **architecture** layer (more detail revealed). |
| `layer-engineering.png` | …at the **engineering** layer (full detail). |
| `walkthrough.gif` _(optional)_ | Layer toggle + MVP scrub + an edit, ~5–8s loop. |

## Capturing (automated)

A Playwright script drives a real browser against the running app and writes the
PNGs here.

```bash
# 1. One-time: install the browser binary
pnpm exec playwright install chromium

# 2. Start the app (either works)
pnpm dev              # http://localhost:5173
# or: pnpm build && pnpm preview   # http://localhost:4173  (--url below)

# 3. Capture (in a second terminal)
node scripts/capture-screenshots.mjs                 # → layer-*.png
node scripts/capture-screenshots.mjs --url http://localhost:4173
node scripts/capture-screenshots.mjs --video         # also records a .webm
```

The browser launches from clean storage, so the app seeds its bundled
**shopfront** example at the latest MVP — a populated graph, no clicks needed.

## Making the GIF

The `--video` flag records a `.webm`. GitHub doesn't autoplay webm inline in a
README, so convert it to a looping GIF with **ffmpeg** (not bundled — install it
locally):

```bash
ffmpeg -i docs/media/*.webm \
  -vf "fps=12,scale=960:-1:flags=lanczos" \
  -loop 0 docs/media/walkthrough.gif
```

Tune `fps`/`scale` for size; keep the GIF under a few MB so the README stays
light. For a hand-authored capture instead, any screen recorder works — just
match the filenames in the table above.

## Conventions

- **Dimensions:** capture at 1440×900, deviceScaleFactor 2 (the script does
  this). Crop to the canvas if a shot has too much chrome.
- **Theme:** use the default theme/brand unless a shot is specifically about
  theming.
- **Keep them current:** regenerate after a visual change that dates a shot;
  stale screenshots mislead more than no screenshots.
