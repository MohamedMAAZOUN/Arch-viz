# Architecture Visualizer

A layered, time-aware platform diagramming tool. Browse platforms across business / architecture / engineering layers, scrub through MVP evolution, drill into live status from Grafana and Jira.

Groups and their children render as **nested containers** (domain → service → data): expand a box to look inside, collapse it to a single node. Containment follows the layer by default (a group's `aggregateAt`) and is overridable per element with a chevron. See `docs/adr/0003-nested-containment.md`.

**Guided tours** play the project's `tours` as a focused, Prezi-style walkthrough: the camera glides between steps, non-highlighted nodes dim, and a caption explains each one. Pick a tour from the floating "Tours" pill; Space advances, arrows step, Esc exits. See `docs/adr/0004-tour-playback.md`.

**Live data**: elements with `dataSources` show a live status dot / value. `http` sources are fetched directly; Grafana/Jira go through a proxy at `VITE_LIVE_PROXY_URL` (the token lives at the proxy, never in the bundle) — unset, they render "offline". Failures degrade to a stale marker, never a crash. See `docs/adr/0005-live-data.md`.

**Export** (inspector → Export): **JSON** (round-trips through the parser), plus **PNG / SVG** of the visible graph at the current layer + MVP. See `docs/adr/0006-export.md`.

## Quickstart

```bash
pnpm install
pnpm dev          # → http://localhost:5173
```

Other scripts:

```bash
pnpm typecheck    # TypeScript with strict flags
pnpm lint         # ESLint (including the wrapper-boundary rules)
pnpm test         # Vitest in watch mode
pnpm test:run     # Vitest once for CI
pnpm build        # Production build
pnpm format       # Prettier write
```

## Repository tour

```
src/
├── main.tsx              # entry point — boots theme, persistence, App
├── App.tsx               # top-level layout (golden ratio split)
├── design-system/        # tokens, theme runtime, primitives
├── core/                 # cross-cutting infrastructure
│   ├── schema/           # Zod definitions, parse (only trust boundary)
│   ├── doc/              # Yjs source of truth (only yjs importer)
│   ├── state/            # Zustand stores (view, selection)
│   ├── layout/           # ELK wrapper (only elkjs importer)
│   └── errors/           # Result type
└── features/             # user-visible capabilities
    ├── canvas/           # React Flow wrapper (only xyflow importer)
    ├── inspector/        # right-side panel with 8 sections
    ├── settings/         # settings menu (theme/brand picker)
    └── topbar/           # header with brand-word + status + settings
```

## The five non-negotiable principles

1. **One source of truth** — `Y.Doc` for the draft, file/DB for the committed.
2. **Wrap external libraries** — xyflow, elkjs, yjs each enter via exactly one file.
3. **Render is a pure function** — `(committed, draft, view) → DOM`.
4. **Boundaries validate** — Zod at every entrypoint. Trusted thereafter.
5. **Schema is law** — UI shapes itself to the schema, never the other way around.

Full rules live in `docs/engineering-guide.md`. Read it before contributing.

## Key documents

- `docs/engineering-guide.md` — the full coding standard
- `docs/schema-example.yaml` — the schema in action on a small e-commerce example
- `docs/adr/` — architecture decision records

## Tech stack (locked in via the dependency study)

| Layer | Library | Wrapped in |
|---|---|---|
| Canvas | `@xyflow/react` | `src/features/canvas/Canvas.tsx` |
| Layout | `elkjs` | `src/core/layout/ElkLayoutEngine.ts` |
| Doc | `yjs` + `y-indexeddb` | `src/core/doc/DocStore.ts`, `persistence.ts` |
| Motion | `motion` | direct use; no wrapper needed |
| State | `zustand` | direct use; pattern enforced |
| Schema | `zod` v4 | `src/core/schema/schema.ts` |
| Styling | `tailwindcss` v4 + tokens | `src/design-system/tokens.css` |

Monaco editor is deferred to v1.5. v1 uses a `<textarea>` + Zod validation for YAML edit.

## License

[TBD]
