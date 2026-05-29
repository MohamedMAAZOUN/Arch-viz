# Architecture Visualizer — Dependency Study

**Date:** May 17, 2026
**Schema version:** 1.0.0
**Tech stack scope:** v1 frontend-only SPA

This document evaluates every external dependency proposed in the tech stack before any application code is written. Each library is scored on maturity, maintenance, bundle cost, TypeScript quality, recent breaking changes, and exit strategy. The goal is one clear go/no-go per dependency, plus the cross-cutting concerns (peer-dep collisions, bundle budget, supply chain) that only become visible when you look at the stack as a whole.

---

## Executive summary

| # | Dependency | Current | Risk | Verdict |
|---|---|---|---|---|
| 1 | `@xyflow/react` (React Flow) | 12.10.2 | Low–Medium | **Adopt** with thin wrapper |
| 2 | `elkjs` | 0.11.1 | Medium | **Adopt** via Web Worker, isolate behind `LayoutEngine` interface |
| 3 | `yjs` | 13.6.30 | Low | **Adopt** for undo/redo from day one; defer multiplayer to v2 |
| 4 | `motion` (formerly `framer-motion`) | 12.38.0 | Low | **Adopt** — production-grade |
| 5 | `zustand` | 5.0.13 | Low | **Adopt** — be mindful of v4/v5 peer with React Flow |
| 6 | `zod` | 4.4.3 | Low | **Adopt** — already used in `schema.ts` |
| 7 | `monaco-editor` + `@monaco-editor/react` | 0.55.1 + 4.7.0 | **High** | **Defer to v1.5** behind an Advanced toggle |
| 8 | `tailwindcss` | 4.x | Low | **Adopt** — v4 is stable, CSS-first config |
| – | `yaml` (eemeli/yaml) | latest | Low | **Adopt** — only needed for file load/save |

Bundle budget for v1: under **1 MB gzipped JavaScript** delivered on first load (excluding optional Monaco, which lazy-loads only when the YAML editor is opened).

The single highest-risk item is **Monaco**. Its bundle size and build-config tax are large enough that I recommend not shipping it in v1. The "edit YAML inline" feature is a power-user nicety, not a must-have. We can ship v1 with a simple `<textarea>` plus client-side Zod validation; bring in Monaco when there is real demand for syntax highlighting and IntelliSense.

The single highest-leverage risk-mitigation choice is wrapping React Flow and ELK behind our own interfaces from day one. Both can be swapped later without rewriting application code — but only if we never let their types leak past the wrapper.

---

## 1. React Flow / `@xyflow/react`

**Role in our stack:** Interactive canvas — nodes, edges, pan, zoom, selection, drag, custom node components, minimap.

| Field | Value |
|---|---|
| Latest stable | 12.10.2 (Mar 27, 2026) |
| License | MIT |
| Repo | github.com/xyflow/xyflow — 36.5K stars, 2.4K forks |
| Maintainer | xyflow (independent company, Berlin, full-time team) |
| TypeScript | First-class; written in TS; tested with Cypress |
| Install size | ~1.2 MB (3 MB unpacked) |
| Runtime deps | 3 (`@xyflow/system`, `classcat`, `zustand`) |
| Peer deps | React ≥17, react-dom ≥17 |
| Recent activity | Monthly patch releases; v12 rebranded from `reactflow` in late 2024 |
| Downloads | 618 packages depend on it on npm (Stripe, Typeform, etc.) |

### What it gives us

- Canvas with pan, zoom, multi-select, keyboard shortcuts out of the box
- Custom node renderers (we'll define one per element type: service, database, queue, group, etc.)
- Custom edge renderers (sync/async/event/data variants)
- `MiniMap`, `Controls`, `Background` plug-in components
- `nodeLookup` (formerly `nodeInternals`) for fast id-based access
- `node.measured` for read-after-render dimensions (needed for ELK input)
- SSR-friendly since v12 if we ever pre-render
- Viewport virtualization for large graphs (re-renders only changed nodes)

### Known issues / things to watch

1. **The v11 → v12 migration was large.** The npm package was renamed (`reactflow` → `@xyflow/react`), dimensions moved to `node.measured`, and nodes/edges are no longer mutable — you must create new objects. We start fresh on v12, so this is historical context, but the team has done one major restructure recently. They could do another.
2. **Internal Zustand dependency at v4.** React Flow ships its own internal Zustand v4 store. If we install Zustand v5 for our app state, we end up with two Zustand instances in the bundle (one for them, one for us). It works fine — they're internal to each library — but be aware of the duplication and the ~10 KB cost. There's also a small risk of confusion if someone tries to read React Flow's internal store with our useStore hook.
3. **No first-party layout algorithms.** Layout is delegated entirely to external libraries (dagre, ELK). This is by design — keeps React Flow focused — but means the layout decision is its own dependency choice (see ELK below).
4. **Pro / sponsorship model.** Some advanced examples (e.g., dynamic grouping) are behind a paid "React Flow Pro" tier. Core is fully MIT and feature-rich; we won't need Pro for v1, but it's worth knowing the commercial model exists.

### Escape hatch

If React Flow ever stops shipping or pivots, our exit is: keep the same data shape (nodes, edges with id/from/to/position), swap the rendering library. Real alternatives: `@projectstorm/react-diagrams` (less polished, smaller), `cytoscape.js` + custom React wrappers (more raw, no React idioms), or hand-rolled SVG with our own pan/zoom (1–2 weeks of work to recreate the basics). None are drop-in, but our wrapper layer makes the migration tractable.

### Wrapper plan

Build `src/canvas/Canvas.tsx` as the *only* file in our codebase that imports from `@xyflow/react`. Application code talks to our `Canvas` props (nodes, edges, onChange, etc.), not React Flow's types. This is non-negotiable. If anyone PRs a `useReactFlow` call in a feature module, reject it.

### Verdict: **Adopt**

Mature, actively maintained, used in production by Stripe-scale teams, MIT, written in TypeScript, fits our model exactly. Wrap it, don't marry it.

---

## 2. ELK.js / `elkjs`

**Role in our stack:** Compute auto-layout positions for our graph at each layer (business / architecture / engineering). Runs in a Web Worker so the UI never stalls.

| Field | Value |
|---|---|
| Latest stable | 0.11.1 (~Mar 2026) |
| License | EPL 2.0 (permissive, compatible with MIT projects) |
| Repo | github.com/kieler/elkjs |
| Maintainer | Eclipse Foundation / Kieler team |
| TypeScript | Type definitions shipped; underlying code is GWT-transpiled Java |
| Web Worker | First-class — `new ELK({ workerUrl })` |
| Algorithms | layered (Sugiyama), force, mrtree, radial, stress, box, more |

### What it gives us

The richest layout algorithm catalog in the JavaScript ecosystem. The flagship `layered` algorithm (Sugiyama-based) is specifically tuned for node-link diagrams with ports — i.e., exactly our use case. ELK supports incremental ("interactive") layout, which is what we need for the smooth MVP-advance behavior: place a new node into the gap nearest its neighbors without disturbing the rest.

React Flow has an official ELK integration example, so we're on a well-trodden path.

### Known issues / things to watch

1. **The codebase is GWT-transpiled from Java.** That has three real consequences:
   - Bundle size is large by JS standards (~700 KB unminified, ~250 KB gzipped for the worker).
   - Some historical issues with bundlers and module formats (issues #127, #141, #142 in the elkjs repo cover GWT-related friction).
   - Stack traces from layout errors are unreadable. We mitigate by validating input rigorously before handing to ELK.
2. **Versioning is `0.x`.** Don't be misled — it's been stable for years. The 0.x signals "tied to the parent Java ELK version" more than "unstable."
3. **Layout calls are async (Promise-based).** Our render pipeline must handle the async gap — show stale layout while new layout computes, then transition with Framer Motion.
4. **No layout cancellation.** If the user changes layers rapidly, layout calls pile up. We must dedupe (only the latest call's result is applied).
5. **Synchronizing measured DOM sizes with ELK input is fiddly.** Workflow: render with auto-sizing → read `node.measured` from React Flow → call ELK with measured dims → write back positions. The first frame is layout-less by necessity. Plan a "settling" animation.

### Performance characteristics

ELK measures execution time in milliseconds in JS. On a 100-node graph with the layered algorithm, expect 50–200 ms; on 500 nodes, 1–3 seconds (worker, not main thread). Beyond ~1000 nodes, we should switch algorithms (`mrtree` or `box` are faster but less pretty) or pre-compute and cache.

### Escape hatch

`dagre` is the alternative — much smaller, simpler, hierarchical-only. If ELK becomes a problem, switch to dagre with a one-day port (same input shape, smaller algorithm choice). Beyond that, we'd write our own layered layout (a graduate-level project — don't go here without strong cause).

### Wrapper plan

Define `src/layout/LayoutEngine.ts` as a tiny interface:

```ts
interface LayoutEngine {
  layout(nodes: Node[], edges: Edge[], opts: LayoutOptions): Promise<PositionMap>;
}
```

Ship `ElkLayoutEngine` as the only implementation. Application code never imports `elkjs` directly. Swap-out cost: low.

### Verdict: **Adopt** — with the wrapper interface from day one

The richest layout library available. Run in a Web Worker, isolate behind a `LayoutEngine` interface, dedupe rapid calls, validate input before handing it off.

---

## 3. Yjs / `yjs`

**Role in our stack:** v1 — undo/redo + draft persistence to IndexedDB. v2 — multiplayer collaboration over a sync server.

| Field | Value |
|---|---|
| Latest stable | 13.6.30 (~Mar 2026) |
| License | MIT |
| Maintainer | Kevin Jahns + community; 10+ years of development |
| Downloads | 900K+ weekly; 958 dependent packages on npm |
| TypeScript | Type definitions shipped; idiomatic JS API (not TS-first) |
| Bundle | ~70 KB gzipped for core; providers add more |

### What it gives us in v1 (even without multiplayer)

- **Undo/redo for free** via `Y.UndoManager`. We get this just for using Y.Map and Y.Array as our state container. No custom history stack to maintain.
- **IndexedDB persistence** via `y-indexeddb`. The draft model survives browser reloads with zero work on our side.
- **Built-in change observation.** Subscribe to mutations on any Y type and react. Plays well with our render pipeline.

### What it gives us in v2

- **Real-time multiplayer.** Add `y-websocket` plus a small Node server, get conflict-free collaborative editing. No further app-code changes.
- **Offline-first.** Edits made offline merge cleanly when the client reconnects.

### Known issues / things to watch

1. **The mental model is non-trivial.** Y.Map and Y.Array are not plain JS — you can't `JSON.stringify` and treat them as data. You access via `.get(key)`, mutate via `.set(key, value)`, and subscribe via `.observe(fn)`. There's a learning curve.
2. **Bridging Yjs ↔ Zustand requires some glue.** Two patterns work: (a) Yjs is the source of truth; Zustand mirrors it via observe callbacks (good for read-heavy UIs); (b) treat Yjs as a side-effect of Zustand updates (simpler, but loses some CRDT benefits). Pattern (a) is the right call for our use case. Libraries like `mutative-yjs` exist to make this less manual; we'd evaluate but not commit to it.
3. **Document size grows monotonically.** CRDTs preserve tombstones for deleted operations. Yjs does aggressive garbage collection, but a long-edited document is still larger than the equivalent plain JSON. For our scale (hundreds of nodes, occasional edits), this won't matter.
4. **Alternative emerging:** Loro (newer CRDT lib) has API ergonomic advantages but a fraction of Yjs's maturity. Not a serious candidate yet.

### Escape hatch

If Yjs becomes a problem, fall back to: (a) a plain immutable model + manual undo/redo stack (1–2 days of work) and (b) localStorage instead of IndexedDB. We lose the multiplayer path entirely. Rust port `Yrs` exists if we ever want server-side CRDT processing.

### Wrapper plan

`src/state/DocStore.ts` exposes high-level operations (`addElement`, `updateProperty`, `undo`, `redo`). Internally these mutate a `Y.Doc`. The rest of the app reads via Zustand selectors that mirror the Y.Doc. Migration cost away from Yjs: medium — but contained to one file.

### Verdict: **Adopt** — for v1, even though multiplayer is v2

The undo/redo + IndexedDB combination alone is worth the integration cost. Building either of those well from scratch takes significant time. Adopting Yjs in v1 keeps the v2 multiplayer path open with near-zero additional cost.

---

## 4. Motion (formerly Framer Motion)

**Role in our stack:** Smooth transitions for layer switches, MVP-slider scrubbing, panel open/close, layout animation when nodes morph between MVPs.

| Field | Value |
|---|---|
| Latest stable | 12.38.0 (Mar 17, 2026) |
| Packages | `motion` (new, recommended) or `framer-motion` (legacy, both maintained) |
| License | MIT |
| Downloads | 31M+ monthly on npm; ~7,800 dependent packages |
| Used by | Framer, Figma, Cursor — production-scale |
| React | Requires ≥18.2 |
| Bundle | ~30 KB gzipped for core; tree-shakeable; lazy variants for further savings |

### What it gives us

- **Layout animation engine.** This is the killer feature for us. When the source of truth changes (a node enters at MVP3, layout differs by layer), Motion detects the layout delta and animates between positions with spring physics. This is exactly the "smooth transitions" we promised, with one prop: `<motion.div layout />`.
- **`AnimatePresence`.** Animates elements entering and exiting the tree — perfect for elements that appear/disappear across MVPs.
- **Hybrid engine.** Runs natively via the Web Animations API for 120fps GPU-accelerated transforms; falls back to JS for things WAAPI can't do (springs, layout, gestures).
- **`useReducedMotion`.** Accessibility for the win — single hook, respects OS setting.

### Known issues / things to watch

1. **Rebrand confusion.** The package was renamed from `framer-motion` to `motion` in late 2024 / 2025. Both are published and maintained. Import path: `motion/react`. Don't be surprised if docs and Stack Overflow answers mix terminology.
2. **Layout animations have a measurement cost.** Each `<motion.div layout />` triggers a reflow read on every render. For 200+ animated elements at the same time, you may need to debounce or use `layoutDependency` to opt out of automatic detection.
3. **React Strict Mode quirks (mostly fixed).** Some historical issues with double-invocation in dev mode have been resolved in 12.x. Worth being aware of.
4. **`will-change` hygiene.** When animating transforms or opacity in hot paths, manually setting `style={{ willChange: 'transform' }}` improves frame rate. Not automatic.

### Bundle optimization

Motion supports `LazyMotion` for tree-shaking out features you don't use. For our v1 (layout + AnimatePresence + simple transitions), we can probably get the bundle cost under 20 KB gzipped. Plan to set this up in week one.

### Escape hatch

If Motion ever disappears: (a) replace simple opacity/translate animations with CSS transitions (1 day); (b) replace layout animations is harder — `react-spring` is the nearest competitor but has a different API and weaker layout-animation story. Worst case, animate manually with `requestAnimationFrame` for the things that genuinely need it.

### Verdict: **Adopt**

Production-grade, used by Framer and Figma, tens of millions of downloads, the layout animation feature is genuinely unique in the React ecosystem. No serious reason to avoid.

---

## 5. Zustand

**Role in our stack:** Application state — current layer, current MVP, selected element, viewport, dirty draft flag, inspector preferences. Mirrors Y.Doc for read-side ergonomics.

| Field | Value |
|---|---|
| Latest stable | 5.0.13 (Mar 16, 2026) |
| License | MIT |
| Repo | github.com/pmndrs/zustand — 57.9K stars |
| Maintainer | pmndrs collective (Poimandres) |
| Install size | 95 KB unpacked, ~1.2 KB gzipped runtime footprint |
| Runtime deps | 0 |
| Downloads | ~20M weekly |

### What it gives us

- Tiny, hook-based store. No provider boilerplate.
- Plays well with React 18 concurrent rendering (and 19) — handles the "zombie child" and context-loss issues correctly.
- Built-in middleware: `persist` (auto-localStorage), `devtools` (Redux DevTools), `immer` (mutable-feeling updates), `subscribeWithSelector` (granular subscriptions).
- Works outside React — accessible from vanilla JS, tests, web workers.

### Known issues / things to watch

1. **The Zustand-inside-React-Flow problem.** React Flow internally uses Zustand v4. If we install v5, both versions end up bundled. Practically fine — they're truly internal — but adds ~10 KB. Worth flagging in the bundle audit.
2. **v5 selector strictness.** In v5, selectors that return new object references trigger render loops more aggressively than v4. Fix: use `useShallow` or memoize selectors. This is well-documented and tooling catches it; just don't be careless.
3. **No enforced patterns.** For a one-person project or small team this is fine. At larger team scale, the lack of conventions can lead to drift. We mitigate with our own slice patterns and docs.
4. **No built-in async patterns.** Data fetching is your problem. For us, irrelevant (no server data in v1).
5. **Persist middleware race condition.** Versions ≤5.0.9 had a race during rehydration with concurrent calls. Fixed in 5.0.10+. We pin ≥5.0.10.

### Escape hatch

Migrate to Jotai (also pmndrs, atomic model) or Redux Toolkit (heavier but more structured). Migration is non-trivial but bounded — Zustand store APIs are simple enough to reverse-engineer.

### Verdict: **Adopt** — pin ≥5.0.10

The standard React state choice in 2026. Tiny, no deps, works with everything else in our stack. Accept the React-Flow-internal-v4 duplication; it's an artifact, not a problem.

---

## 6. Zod

**Role in our stack:** Schema validation at the file ↔ memory boundary. Used in `schema.ts` to validate project documents on load.

| Field | Value |
|---|---|
| Latest stable | 4.4.3 |
| License | MIT |
| Maintainer | Colin Hacks (with Clerk OSS sponsorship for v4 work) |
| GitHub stars | 42.6K |
| Downloads | 31M weekly |
| TypeScript | TS-first; the library is built around type inference |

### What it gives us

- Schema definition + parsing + type inference in one. Our `schema.ts` is the source of both the validator *and* the TypeScript types — they cannot drift.
- `discriminatedUnion` for element types (`service`, `database`, `group`, etc.).
- `superRefine` for cross-field invariants (parent must exist, MVP refs must resolve).
- `safeParse` returns a result object instead of throwing — clean error UX.

### Known issues / things to watch

1. **v3 → v4 was a real migration.** Already done in `schema.ts` (we wrote against v4). Anyone reading old Zod docs needs to watch for v3 idioms.
2. **The "Zod 3 ships v4 internally" episode.** During the transition window, `zod@3.25+` bundled both v3 and v4 with subpath imports (`zod/v3`, `zod/v4`). This caused issues for users on older TypeScript versions (had to upgrade TS 4.9 → 5.x). We're on v4 from the start, so unaffected, but be aware when reading historical issues.
3. **Bundle size on the legacy method-chaining API is large.** v4 is 2.3x smaller than v3 core, but you can still pull in unused validators if you're not careful. For our schema (~12 schemas), bundle impact is negligible (~15 KB gzipped).
4. **`@zod/mini` exists.** A minimal version with a function-based (not method-chaining) API and aggressive tree-shaking. Bundle-size win for cold-start contexts, not relevant for us.

### Performance

v4 was a complete rewrite for performance: 14× faster string parsing, 7× faster array parsing, 10× faster TypeScript compilation. We will not notice any cost.

### Escape hatch

Valibot has a smaller bundle (~1 KB) and a similar API. Migration is non-trivial — schema definitions look different — but bounded. Alternatively, hand-write validators (don't).

### Verdict: **Adopt** — already in use

We already committed to Zod 4 in `schema.ts` and it validates the example YAML cleanly. No changes needed.

---

## 7. Monaco editor + `@monaco-editor/react`

**Role in our stack:** *Optional* in-app YAML editor with syntax highlighting, IntelliSense via JSON Schema, and live validation. Triggered only when the user opens "Edit YAML" from the menu.

| Field | Value |
|---|---|
| Core `monaco-editor` | 0.55.1 (~6 months old at time of writing) |
| React wrapper `@monaco-editor/react` | 4.7.0 (~12 months since last release) |
| License | MIT (both) |
| Maintainer | Microsoft (Monaco core); Suren Atoyan (the React wrapper) |
| Bundle | Monaco core is ~5 MB unminified, ~2 MB gzipped |
| Build setup | Requires `monaco-editor-webpack-plugin` or Vite-equivalent for proper worker setup |

### What it gives us

The same editor that powers VS Code, embedded in the browser. JSON Schema-aware autocompletion against our Zod schema (via a converter), real-time validation underlines, find/replace, multi-cursor, the works. For an engineer authoring YAML by hand, it is genuinely superior to any other web editor.

### Why I'm flagging this as high-risk

1. **Bundle size.** Monaco's footprint dwarfs every other dep in our stack combined. Even with lazy loading, the *first* time the editor opens it downloads ~2 MB gzipped. On mobile or slow connections, this is painful.
2. **Build setup tax.** Monaco insists on web workers for language services. Setting these up correctly with Vite is doable but takes a half-day of configuration and is fragile across bundler versions.
3. **The React wrapper has slowed.** `@monaco-editor/react` 4.7.0 was the last release ~12 months ago. There's a release candidate for React 19 support but the cadence has clearly cooled. The wrapper is a thin layer around the official Monaco API, so worst case we drop it and use Monaco directly — but that's another half-day of work.
4. **Custom theming is laborious.** Monaco's theming system is its own thing, completely separate from Tailwind / CSS variables. Matching our design system inside the editor requires duplicating tokens.
5. **The feature is a nicety, not a necessity.** v1 users will edit by drag-drop on the canvas and forms in the inspector. Hand-authored YAML is a v1.5 feature for power users.

### Escape hatch

Two alternatives that are good enough for v1.5:
- **CodeMirror 6** — smaller bundle (~150 KB), modern, well-maintained, has YAML mode. Worse autocomplete than Monaco but much lighter.
- **Plain `<textarea>` + client-side Zod validation feedback** — zero new deps, ships in v1. Show validation errors inline. 80% of the value for 1% of the cost.

### Verdict: **Defer to v1.5**

Build v1 with a plain textarea backed by Zod validation. Revisit in v1.5 when we know whether power users actually want a heavy editor. If yes, evaluate CodeMirror 6 first; only adopt Monaco if the feature gap is real.

---

## 8. Tailwind CSS

**Role in our stack:** Design system delivery. Centralized theme tokens via `@theme`, utility classes for component composition, atomic CSS.

| Field | Value |
|---|---|
| Major version | 4 (stable since early 2025; v4.3+ as of mid-2026) |
| License | MIT |
| Maintainer | Tailwind Labs |
| Build engine | "Oxide" — Rust-based, via Lightning CSS |
| Performance | 5× faster full builds vs v3; 100× faster incremental |

### What it gives us

- **CSS-first config via `@theme`.** Design tokens are CSS custom properties, not JavaScript objects. They cascade naturally, work without JS, and any tool can read them.
- **OKLCH color space by default.** More perceptually uniform than hex/RGB, supports `color-mix()` for layer overlay coloring.
- **Zero-config content detection.** No more `content: ['./src/**/*.tsx']` — Tailwind auto-scans.
- **First-party Vite plugin** (`@tailwindcss/vite`). One line in `vite.config.ts`.
- **Native CSS layers and container queries.** Powerful for our inspector responsive behavior.
- **Excellent fit with our "design system centralized, golden ratio at macro" plan.** All scales (typography, spacing, radius) become CSS variables; we can compose them at any level.

### Known issues / things to watch

1. **Breaking changes from v3.** Default border color changed (`gray-200` → `currentColor`), `.passthrough`/`.strict` deprecated, JS config gone. Migration tool handles most of it. We start fresh on v4, so no migration burden.
2. **Plugin ecosystem is mostly v4-ready but not 100%.** Headless UI v2, shadcn/ui, Radix are all v4-compatible. Niche plugins may not be. We won't pull in niche plugins in v1.
3. **CSS-first config is less flexible for computed values.** Some advanced patterns from v3 (programmatic color generation, JS-imported variables) need rethinking in v4. For a design system with static tokens, no impact.

### Verdict: **Adopt v4 from day one**

The performance, the CSS-first model, and the OKLCH defaults are all wins for us. v3 is now legacy.

---

## Cross-cutting concerns

### Bundle budget for v1

Rough estimate, gzipped, first-load JS only (no Monaco):

| Dependency | Gzipped |
|---|---|
| React + React-DOM | ~45 KB |
| `@xyflow/react` (+ internal Zustand v4) | ~60 KB |
| `elkjs` (lazy-loaded into a worker) | ~250 KB (off main bundle) |
| `yjs` + `y-indexeddb` | ~90 KB |
| `motion` (with `LazyMotion`) | ~20 KB |
| `zustand` v5 | ~1 KB |
| `zod` | ~15 KB |
| `yaml` parser | ~25 KB |
| App code (estimate) | ~100 KB |
| **Total first-load** | **~360 KB** |

That's comfortably under our 1 MB budget. ELK adds ~250 KB but is loaded in a Web Worker after page render — invisible to user-perceived load time. Monaco at 2 MB gzipped, by contrast, would single-handedly blow the budget. (Reinforces "defer Monaco to v1.5.")

### Peer dependency / version coupling

The one collision in our stack: **React Flow internally depends on Zustand v4**. We install Zustand v5 for app state. Both versions bundle together; both work; ~10 KB cost. Acceptable. Monitor in v2 if React Flow upgrades to v5 internally — we'd simplify.

Aside from that, every dep in the list above peers on React ≥18.2 and is currently compatible with React 19. We commit to React 19 from day one.

### Supply chain hygiene

The TanStack supply chain compromise in May 2026 was a reminder that nothing in the npm ecosystem is invulnerable. Concrete practices to adopt from project start:

1. **Lockfile committed.** `pnpm-lock.yaml` checked into Git, CI fails on diff.
2. **Renovate or Dependabot.** Automated PRs for updates, with separate cadences for patch vs minor vs major.
3. **`pnpm audit` in CI.** Block merges with high-severity unpatched vulns.
4. **Pin direct dependencies to exact versions in `package.json`.** Use `~` for patches if convenience matters; never `^` for new dependencies.
5. **Vendor in critical libraries we can't easily replace.** Not now — but if any dep ever shows signs of abandonment, consider forking and pinning.

### ESM vs CJS

All our chosen dependencies ship modern ESM. Vite handles this natively. We do not target Node.js runtime for the frontend. If we ever build a Node backend in v2, we run as ESM (`"type": "module"` in `package.json`) and inherit no friction.

### Source vs binary licensing

Every dependency above is permissive (MIT, EPL 2.0, or BSD-equivalent). No copyleft surprises. If we ever build a commercial offering, no license obligations beyond attribution.

---

## Final recommendation

Adopt: React Flow, ELK, Yjs, Motion, Zustand, Zod, Tailwind v4, the YAML parser.
Defer to v1.5: Monaco — replace with `<textarea>` + Zod validation feedback in v1.

Three architectural constraints to lock in before writing any feature code:

1. **Wrap React Flow and ELK** behind `src/canvas/Canvas.tsx` and `src/layout/LayoutEngine.ts`. No `@xyflow/react` or `elkjs` imports anywhere else in the codebase. This is the single most important durability decision.
2. **Yjs is the source of truth for the draft document.** Zustand mirrors it. The application reads from Zustand, writes through `DocStore.ts`. Undo/redo and IndexedDB persistence come from Yjs for free.
3. **All design tokens live in CSS via `@theme`.** Application code references `var(--color-tone-critical)`, not Tailwind utility classes for things that need theming. Utilities are for layout/spacing only.

Bundle budget for v1: 360 KB gzipped first-load JS. ELK and any future Monaco load lazily.

## Open questions

These are not blocking — they're calls to make in the *next* working session.

1. **Yjs ↔ Zustand glue: roll our own or use `mutative-yjs`?** Mutative-yjs is small (~3 KB) and saves us a day of glue code, but it's young (single maintainer). We can spike both in an hour.
2. **`y-indexeddb` vs custom IndexedDB layer?** y-indexeddb is the path of least resistance and known to work; custom would give us control over compaction. Default to y-indexeddb.
3. **Lazy-loading strategy.** Vite handles dynamic `import()` cleanly. We should route-split: `/canvas` loads React Flow + Motion + ELK worker; `/share/:id` (view-only embed) loads only React Flow without editing chrome.
4. **shadcn/ui or roll our own inspector components?** shadcn is v4-compatible and gives us a great head start on the inspector primitives (accordion, button, dialog, scroll area). I'd lean toward it; it's not really a dependency, just copy-pasted Radix-backed code we then own.
