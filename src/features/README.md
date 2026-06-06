# `features/` — user-visible capabilities

One folder per capability. Each owns its components, CSS, and feature-local
hooks. Features are composed from `App.tsx` (or a parent feature's composition
root) and talk to each other **only** through `core/`.

## The two import rules

1. **A feature MUST NOT import from a sibling feature.** No
   `features/inspector → features/canvas`. Shared state flows through
   `core/state`; shared document access through `core/doc`. (ESLint enforces
   this.)
2. **Mount from a composition root, never reach across.** A feature is added to
   the app by mounting it in `App.tsx` or inside another feature it's part of —
   not by a sibling importing it.

## Folder conventions

- **One component per file.** Default export is the component.
- **Co-locate CSS.** `Foo.tsx` ↔ `Foo.css`. Theming via CSS variables (tokens),
  layout via Tailwind utilities.
- **Co-locate tests.** `Foo.tsx` ↔ `Foo.test.tsx`. (`tests/` at the repo root is
  E2E only.)
- **Hooks named `use*`**, feature-local unless they belong to `core/`.

## The features

| Folder | What it does |
|---|---|
| `canvas/` | The diagram. **Only** file allowed to import `@xyflow/react`; owns camera, node/edge mapping, and the two-stage layout via `useLayoutedGraph`. |
| `inspector/` | Right-side panel: per-element sections (properties, docs, annotations, dependencies, live status, export) and global/multi-select summaries. |
| `topbar/` | Header: brand word, dirty/save status, settings entry. |
| `layer-toggle/` | Business / architecture / engineering switch + display controls + Reorganize. |
| `mvp-slider/` | Scrub through MVP versions; single vs overlay mode + legend. |
| `element-editor/` | The "add element" palette (builds via `core/doc/authoring`). |
| `tour/` | Guided-tour launcher + player (camera glides, dimming, captions). |
| `file-loader/` | Load a project / pick a bundled example. |
| `panels/` | Floating, draggable panel chrome. |
| `settings/` | Theme / brand picker, example switcher. |
| `notifications/` | Toast surface (`notificationStore`-driven). |
| `shortcuts/` | Global keyboard shortcuts wiring. |

## Adding a feature

1. New folder `src/features/<name>/`.
2. One component per file; co-locate CSS + tests.
3. Mount it from `App.tsx` (or its parent feature).
4. Reach other features only via `core/state` selectors / `core/doc` hooks.

See `docs/engineering-guide.md` §§ 1–6 and the feature-specific ADRs in
`docs/adr/` (`0002-floating-panels`, `0003-nested-containment`,
`0004-tour-playback`, `0007-authoring-overlay-docs`).
