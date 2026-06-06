# ADR-0008 — ELK auto-layout in a Web Worker (via `elk-api`, not the bundled build)

## Status

Accepted · June 6, 2026

## Context

Auto-layout is the single most expensive computation in the app: a 300-node
graph takes ~1s of pure ELK work. Running that on the main thread freezes the
canvas — no pan, no zoom, no input — for the duration. ELK is also large
(`elk-worker.min.js` is ~1.5 MB raw), so however we load it must not land in the
first-paint bundle for users who only ever view a small diagram.

This decision was previously recorded only as a "gotcha" in the engineering
guide. It is load-bearing enough — and easy enough to break on an `elkjs`
bump — to deserve its own record.

## Decision

**ELK runs entirely inside a Web Worker** (`src/core/layout/layout.worker.ts`).
The main thread talks to it through `ElkLayoutEngine`, which implements the
`LayoutEngine` interface, assigns each request a monotonic id, and resolves the
matching promise when the worker answers (stale responses are dropped on id
mismatch).

**The worker imports `elkjs/lib/elk-api.js`, NOT `elk.bundled.js`.** The bundled
build internally does `require('./elk-worker.min.js')` to spawn a sub-worker.
Rollup's CommonJS plugin unwraps that `require` at build time, which breaks
ELK's runtime "am I in a worker?" check and throws `_Worker is not a
constructor` from inside the worker. Instead we hand `elk-api` the worker script
URL via Vite's `?url` import (`elkjs/lib/elk-worker.min.js?url`); Vite emits it
as a standalone, fingerprinted asset and ELK spawns it with the global `Worker`
constructor that exists in our worker scope.

**Bundle placement.** `new Worker(new URL("./layout.worker.ts", import.meta.url))`
makes Vite emit the worker (and therefore ELK) as its own chunk, off the main
entry. The 1.5 MB `elk-worker.min.js?url` asset is referenced only by that
worker chunk, so it is fetched lazily on the **first layout request** — after a
project loads — never at first paint. It compresses ~3.5× on the wire (≈451 KB
gzip), which is the static host's job. The `no-restricted-imports` ESLint rule
that forbids `elkjs` elsewhere exempts the worker file (it is the one wrapper).

## Consequences

What gets easier:
- The canvas stays interactive while a layout is computing; `useLayoutedGraph`
  surfaces an `isLaying` flag for the "laying out…" affordance.
- ELK never weighs on first paint. A viewer of a small diagram pays for it only
  when a layout actually runs.
- Swapping ELK for another engine (dagre, custom) means rewriting one worker +
  its main-thread wrapper; the `LayoutEngine` contract shields the rest.

What we accept:
- The async, message-passing boundary: layout is a `Promise`, results correlate
  by request id, and the engine must defend against stale/out-of-order replies.
- A standing constraint on `elkjs` upgrades — see the re-verify checklist below.

## Re-verify after any `elkjs` bump

```bash
pnpm build && cd dist
# 1. Lazy: should list only layout.worker-*.js, never index-*.js / index.html
grep -rl elk-worker assets/*.js
grep -l elk-worker index.html assets/index-*.js || echo "good: not in the entry"
# 2. Transport size of the emitted asset
gzip -9 -c assets/elk-worker.min-*.js | wc -c
```

If the bundled build ever fixes its worker-context detection under a CJS
bundler, revisit the `elk-api` choice — but only with the check above green.

## Alternatives considered

- **`elk.bundled.js` on the main thread.** Rejected — freezes the UI and ships
  ELK in the first-paint bundle.
- **`elk.bundled.js` inside the worker.** Rejected — the CJS-unwrap bug above
  (`_Worker is not a constructor`).
- **A WASM ELK build.** Not pursued in v1; the JS build is fast enough off-thread
  and avoids a second toolchain. Revisit only if profiling demands it.
