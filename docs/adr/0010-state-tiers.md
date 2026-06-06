# ADR-0010 — Three-tier state model (document / view / local)

## Status

Accepted · June 6, 2026

## Context

A diagramming tool juggles wildly different kinds of state: the project itself
(elements, connections, lifecycle), how the user is *looking* at it right now
(layer, MVP, selection, viewport), and throwaway widget state (is this popover
open). Putting a value in the wrong place is the single biggest source of bugs in
this class of app — a selection stored in the document leaks one user's cursor to
everyone in a future multiplayer world; a layer toggle stored in component state
can't be read by the inspector.

The split is described in the engineering guide; this ADR records the decision
and its rationale so it can't quietly erode.

## Decision

Every piece of state lives in exactly one of three tiers, chosen by **lifetime
and ownership**, not by convenience.

### Tier 1 · Document state → `Y.Doc`, via `DocStore`

Anything that is part of the project document: elements, connections, lifecycle,
properties, tours, **layout overrides**, MVPs, layers. Lives in a single `Y.Doc`,
touched **only** through `DocStore` high-level operations (the one file allowed
to import `yjs`). Persisted continuously to IndexedDB (draft) and to file on Save
(committed).

*Why Yjs and not a plain immutable object:* free undo/redo (`Y.UndoManager`),
free local persistence (`y-indexeddb`), and a free path to multiplayer in a later
version. The price is a non-trivial mental model — contained to `DocStore.ts`.

### Tier 2 · View state → Zustand

Everything about *how the user is currently looking at* the document: selection,
current layer, current MVP and MVP mode, the pan/select tool, viewport,
group expand/collapse, inspector section expansion, tour playback position, and
modal/menu open states. Lives in small, single-concern Zustand stores
(`viewStore`, `selectionStore`, `tourStore`, …) read through **narrow
selectors** (subscribe to `currentLayer`, not the whole store).

*Why not in Yjs:* this state is per-session and per-user, not part of the
project. Storing it in the document would make multiplayer messy — each user
wants their own selection and viewport, not a shared one.

### Tier 3 · Local state → `useState`

Truly component-local: an uncommitted form field, hover/focus, a single
popover's open flag, animation refs. No store, no document.

### The rule of escalation

Escalate only when forced: when a **sibling** needs to read it, lift to Zustand;
when it must survive **reload**, lift to Yjs (if it's document) or `localStorage`
(if it's a user preference). Never prop-drill more than two levels. No React
Context for *dynamic* state (it cascades re-renders) — Context is for static
config (theme, brand) only.

## Consequences

What gets easier:
- Multiplayer stays tractable: the document is shared, the view is private, by
  construction.
- Render stays a pure function of `(committed, draft, view)` — no hidden reads.
- Undo/redo only ever touches the document, so a layer switch or a selection can
  never land on the undo stack.

What we accept:
- A judgment call on every new piece of state. "Is this *the project*, or *my
  view of it*?" is the question to ask; when unsure, default to view state and
  escalate to the document only if it must be saved with the project.
- The Yjs mental model, paid once and quarantined to `DocStore.ts`.

## Alternatives considered

- **One global store for everything.** Rejected — couples per-user view state to
  the shared document and makes undo/redo and multiplayer ambiguous.
- **Redux / a single reducer.** Rejected — heavier than needed; Zustand's
  per-store selectors give the granularity we want without boilerplate.
- **React Context for view state.** Rejected — cascading re-renders on every
  layer/MVP change; Context is reserved for static configuration.
