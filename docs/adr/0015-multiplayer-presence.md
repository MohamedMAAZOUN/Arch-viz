# ADR 0015 — Multiplayer sync client & presence

- **Status**: Accepted
- **Date**: 2026-06-15
- **Implements**: issues #65 (Hocuspocus sync) and #66 (presence & awareness)
- **Builds on**: ADR 0014 (backend & multiplayer design)

## Context

ADR 0014 designed the backend, including the multiplayer story: Hocuspocus on
the same Node/Fastify process, a `yjs_updates` (`bytea`) log per document, a
short-lived ws-token JWT handshake, and per-project rooms. The data layer was
already multiplayer-ready (Yjs is the document store, principle 1). This ADR
records the concrete wiring of the sync **server**, the sync **client**, and
**presence**, plus the boundaries that keep them from leaking across the app.

## Decisions

### Server — Hocuspocus on the shared process

- One `Hocuspocus` instance, mounted via `@fastify/websocket` on the existing
  Fastify HTTP server at `GET /sync` (the document/room name travels in the Yjs
  protocol messages, so a single endpoint suffices — one room per project).
- **`onAuthenticate`** verifies the ws-token JWT (`GET /auth/ws-token`, session-
  guarded, ~60s, HS256 signed with the server secret — no IdP involvement,
  identity is internal by now) and runs the **#61 role check** reused verbatim
  from the REST layer. A viewer's connection is set `readOnly` — read-only sync
  is **server-enforced**, not a UI courtesy.
- **`onLoadDocument`** replays the append-only `yjs_updates` log into the
  `Y.Doc`; **`onStoreDocument`** (debounced) appends the delta since the last
  persist and **compacts** the log into a single full-state row once it exceeds
  a threshold, keeping the table bounded under sustained editing. This core is
  in `sync/persistence.ts` so it is unit-tested with a real `Y.Doc` and the
  in-memory repository — no socket, no Postgres.
- **Boundary**: `yjs` and `@hocuspocus/server` may be imported only under
  `apps/server/src/sync/**` (the server-side analogue of the DocStore wrapper),
  ESLint-enforced.

### Client — one provider wrapper, DocStore unchanged

- `@hocuspocus/provider` enters through exactly one file,
  `core/collab/syncProvider.ts` (ESLint-enforced). It attaches to the existing
  singleton `Y.Doc`; **DocStore's API surface is unchanged**. `y-indexeddb`
  stays wired as the offline cache, so offline edits merge on reconnect (CRDT,
  no merge code).
- `core/collab/collabController.ts` connects a room when an authenticated user
  has a server project open and disconnects otherwise — no React, just store
  subscriptions. Multiplayer requires an internal identity (the ws-token is
  session-guarded), so guests viewing a public project don't get live sync.

### Presence — awareness in the view-state tier

- Yjs awareness (free with Hocuspocus) carries each participant's `user`
  (name/role) and `selection`. The provider wrapper publishes remote
  participants to **`presenceStore` (Zustand, view-state tier)** — never the
  `Y.Doc`, never Postgres (state-tiers rule, ADR 0010).
- Per-user color comes from a dedicated **presence palette** in `tokens.css`
  (`--color-presence-1..8`); a participant maps to one by Yjs client id. JS only
  ever passes a **color index** and references the token via a CSS custom
  property — no raw color authored outside `tokens.css`.
- The topbar shows "who's here" avatars (initials + viewer/editor indicator);
  the canvas highlights a remote participant's selected node with a dimmed ring
  in their color.

## Consequences

- Two new wrapped libraries (`@hocuspocus/server`, `@hocuspocus/provider`), each
  behind a single-entry boundary; the rest of the app is unchanged.
- Multiplayer and presence move off the deferred list (AGENTS.md / engineering
  guide updated accordingly).

## Known follow-up — snapshot vs. live-CRDT seeding

Opening a server project hydrates the `Y.Doc` from its latest committed snapshot
(REST) and then attaches the room. For the first editor of a project with no
live state this seeds the room correctly; if a room already holds authoritative
live state, the loaded snapshot and the live state are independent CRDT
histories and can merge into duplicated content. A robust fix (let the room's
Yjs state be the sole source of truth once created, and only seed an empty room)
is deferred to a follow-up; it does not change the wrapper boundaries recorded
here.
