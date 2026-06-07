# ADR 0013 — Auto-discovered architecture catalog & ⌘K switcher

- **Status**: Accepted
- **Date**: 2026-06-07

## Context

Bundled sample projects ("examples") used to live in a hand-maintained registry
(`src/data/examples.ts`) with one entry per file, surfaced only as a list inside
Settings. Adding a project meant editing TypeScript. There was no fast way to
switch between projects, and no way to find one by what it contains.

## Decision

- **A single repo-root `architectures/` folder is the source of truth.** Every
  `*.yaml` in it is discovered at build time via Vite's `import.meta.glob`
  (`src/data/architectures.ts`). The filename (sans extension) is the id. Drop a
  file in → it appears. No registry to edit.
- **The catalog is data-driven.** Display name, description, and element/node
  names come from each file's `project` / `elements`; a cached search index
  (`{ name, description, elementCount, nodeNames }`) is built on first open with a
  light YAML parse. The full YAML for a chosen architecture is fetched on demand
  (its own chunk) and validated through the schema trust boundary
  (`parseProjectYaml` → `loadArchitectureById` → `loadProject`).
- **A command-palette switcher** (`src/features/architecture-picker/`) opens from
  the TopBar project pill and via **⌘K / Ctrl-K**. It searches the architecture
  name **and** the names of the nodes inside, showing which nodes matched.
- **Settings no longer lists projects** — the switcher is the single browse/open
  surface.

## Consequences

- Adding a sample architecture is a pure content change (drop a validated YAML).
- `bootstrap.ts` and the empty-state `LoadExampleButton` import the default
  (`architectures/example-project.yaml`) directly; everything else flows through
  the discovered catalog.
- The default seed id (`DEFAULT_ARCHITECTURE_ID`) lives in
  `src/data/architectures.ts`.
