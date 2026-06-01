# ADR-0007 — In-app authoring, MVP overlay, and inspector docs/annotations

## Status

Accepted · June 1, 2026

## Context

Three backlog features shipped together (issues #5–#7). They share a theme:
turning the tool from "view + edit existing" into "author from scratch, across
time, with notes." Each touches a different tier, so they're recorded together
to keep the rationale in one place.

- **#5 MVP overlay/diff** — the slider scrubbed to a single point in time; the
  original design also wanted a mode showing every element color-coded by the
  MVP that introduced it.
- **#6 Documentation & Annotations** — the inspector's two trailing sections
  were "Coming soon" placeholders.
- **#7 Add/remove elements & connections** — you could edit and drag existing
  elements but not create, delete, or connect them without hand-editing YAML.

## Decision

### Schema first (#6)

Added two optional fields to every element in `schema.ts`: `documentation`
(markdown string) and `annotations` (array of `{ id, body, author?, createdAt }`).
Both are additive and backward-compatible, so `$schemaVersion` stays `1.0.0`.
The annotation shape is a superset of what the deferred collaborative version
(multiplayer epic) needs, so that upgrade is additive, not a migration.

### DocStore mutations (#6, #7)

New high-level operations, each one `mutate()` call = one undo step:
`updateElementDocumentation`, `addAnnotation`, `removeAnnotation`, `addElement`,
`removeElement`, `addConnection`, `removeConnection`. `removeElement` **cascades**:
it removes the element's whole descendant subtree, every connection touching a
removed id, and all per-layer layout overrides for removed ids — otherwise the
document would fail validation (orphaned `parent`/connection refs). Duplicate-id
adds throw (invariant violation, per the error-handling guide).

### Pure authoring factories (#7)

`core/doc/authoring.ts` (`buildElement`, `buildConnection`) construct minimal,
schema-valid objects with a fresh unique id (`lib/id.ts`) and a lifecycle
introduced at the current MVP so the result is visible immediately. Pure and
unit-tested by parsing their output through the real schema. The "add element"
palette and drag-to-connect both consume them.

### MVP overlay as view state (#5)

`viewStore.mvpMode: "single" | "overlay"`. Overlay tints each node by its
introducing-MVP color (passed as `--overlay-tint` into the node, consumed by
CSS) and shows `MvpOverlayLegend`, a floating color→MVP key. The element set is
unchanged — `resolve()` already exposes `introducedIn`; overlay is purely a
view concern, so it lives in Zustand, not the document.

### Markdown rendering without a dependency (#6)

`lib/markdown.ts` is a small pure parser → block tree (headings, lists, code,
quotes, paragraphs, inline strong/em/code/links). `inspector/sections/Markdown.tsx`
renders that tree into React elements — **no `dangerouslySetInnerHTML`**, so
there is no HTML-injection surface; unsafe link hrefs are dropped to text.
Chosen over adding `react-markdown`/`marked` to keep the first-load bundle lean
for a feature that renders short notes.

### Delete affordances (#7)

Two paths share `core/doc/elementDependents.countElementDependents`: an inspector
"Danger zone" button (inline two-step confirm when there are dependents) and a
global `Delete`/`Backspace` shortcut (`window.confirm` when there are dependents,
skipped while typing in a field). Connections are deletable from the inspector's
Dependencies list. Drag-to-connect enables React Flow's `nodesConnectable` and
routes `onConnect` through `buildConnection` + `docStore.addConnection`.

## Consequences

What gets easier:
- A diagram can be authored end-to-end in the UI; every change is one undo step.
- Overlay reuses the existing resolve/color pipeline — no new layout path.
- The markdown renderer has zero runtime deps and a testable pure core.

What we accept:
- `removeElement`'s cascade is intentionally aggressive (whole subtree). It's
  one undo away, and the alternative — reparenting orphans — is surprising.
- `window.confirm` for the keyboard-delete cascade is a stopgap until the shared
  toast/dialog primitive (issue #13) lands; the inspector path uses inline confirm.
- The markdown parser is deliberately small (no nested lists/tables).

## Alternatives considered

- **Documentation/annotations inside `properties`.** Rejected — they'd be
  subject to `lifecycle.modifiedIn` patching and mixed with type-specific fields.
  First-class element fields are clearer.
- **Adopting a markdown library.** Rejected for bundle weight; revisit if rich
  authoring (tables, embeds) is ever needed.
- **Overlay as a document/MVP change.** Rejected — it's how you *look* at the
  doc, so it's view state.
- **A diff sub-mode (added/removed between two MVPs).** Deferred; the issue
  marks it optional and the color-coded overlay meets the acceptance criteria.
