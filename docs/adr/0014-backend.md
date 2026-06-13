# ADR 0014 — Backend & database (catalog, auth, persistence, multiplayer)

- **Status**: Accepted
- **Date**: 2026-06-12
- **Roadmap**: issues #53–#69 (milestones 0–5)

## Context

arch-vis is a frontend-only SPA. Architectures are static (bundled YAML
discovered at build time, ADR 0013), persistence is local-only (the draft
`Y.Doc` in IndexedDB, per browser), and there is no sharing, no cross-device
access, and no identity. Three deferred items — multiplayer (#37),
collaborative annotations (#38), and a live-data proxy — all share one missing
ingredient: a backend.

Constraints carried over from the existing architecture:

- **Yjs is already the document store** (principle 1). Whatever backend we add
  must build on the `Y.Doc`, not replace it — that is what keeps multiplayer
  an incremental step instead of a rewrite.
- **Boundaries validate** (principle 4) and **schema is law** (principle 5).
  A backend in a different language would force a second, drifting schema
  definition; sharing the Zod schema requires TypeScript end to end.
- **Wrap external libraries** (principle 2). Every new external system —
  the HTTP API, the sync provider — enters the web app through exactly one
  module.

## Decision

### Stack

One Node 20 + TypeScript server process and one Postgres database:

- **Fastify** — REST routes (catalog, snapshots, auth), Zod-validated
  request/response via `fastify-type-provider-zod` using the shared schema.
- **Hocuspocus** — Yjs sync over WebSocket (Milestone 4), mounted on the same
  HTTP server as Fastify (upgrade requests routed to it).
- **Drizzle** — typed SQL + migrations; all DB access behind one repository
  module (the server-side analogue of the one-entry-point rule).
- **Postgres** — one database for three data shapes: relational tables
  (users, projects, members), `jsonb` (committed snapshots, round-tripping
  through the shared Zod parser), and `bytea` (the Yjs update log).

Alternatives considered: BaaS (Supabase/Convex) — fastest to ship but doesn't
speak Yjs, so multiplayer would still need a separate sync layer; managed Yjs
(Liveblocks/Y-Sweet) — covers sync but still needs a catalog + auth backend;
edge (Workers + Durable Objects) — good Yjs fit but the most novel option to
operate. The Hocuspocus + Postgres stack is the only one where catalog,
persistence, and multiplayer land in a single deployable.

### Monorepo

pnpm workspace: `apps/web` (the current `src/`), `apps/server`, and
`packages/schema` (the Zod schemas extracted from `src/core/schema`, consumed
by both apps). The restructure (#54) is its own PR, merged before any backend
code, with no behavior change.

### Authentication — two coexisting modes

Both providers can be enabled per deployment (each toggleable by env;
`GET /auth/config` tells the frontend what to render):

- **Local**: email/password, argon2id hashes, rate-limited login.
- **OIDC (ForgeRock AM)**: Authorization Code + PKCE via `openid-client`;
  endpoints and JWKS discovered from the issuer URL.

**One internal session contract.** Whatever the mode, a successful login
produces the same thing: a `users` row and a server-issued session. IdP tokens
are exchanged once, server-side, in the callback — they are never sent to the
browser and never used to authenticate API calls. (This is the same pattern
Grafana uses: server-side code exchange, then its own `grafana_session`
cookie.)

**Sessions**: opaque httpOnly `SameSite=Strict` cookie; token rotation
(~10 min of activity, Grafana-style — reuse of a rotated-out token is
detectable); idle + absolute lifetimes. CSRF = SameSite + origin-check
middleware. WebSocket handshake: `GET /auth/ws-token` issues a short-lived
(~60 s) signed JWT consumed by Hocuspocus `onAuthenticate` — identity is
internal by that point.

**Identity resolution (Grafana-informed).** `users.email` is UNIQUE, but the
*lookup* order on OIDC login is:

1. `(issuer, sub)` in `federated_identities` → refresh claims, stamp
   `last_login_at`. An email change at the IdP updates the user instead of
   creating a duplicate.
2. Else `users.email` → **one-time link**: attach a `federated_identities`
   row to the pre-existing (e.g. local) account. This is what makes local ↔
   SSO account linking work.
3. Else **lazy-create** user + federated identity in one transaction. First
   login *is* provisioning; ForgeRock stays the source of truth for who gets
   in.

Email-based linking is acceptable because the IdP is a single corporate
ForgeRock with verified emails. Adding social/unverified IdPs would require
revisiting this (Grafana ships email lookup off by default as
`oauth_allow_insecure_email_lookup` for exactly this reason).

**Future knob (documented, not built)**: store the refresh token server-side
and revalidate against ForgeRock on a timer for continuous IdP authority —
an internal change, invisible to the frontend and to local-mode users.

### User status lifecycle

`status ∈ active | disabled | blocked` on `users`:

| Transition | Trigger |
| --- | --- |
| `active → disabled` | admin action (offboarding) |
| `disabled → active` | **automatic** on any successful authentication |
| `anything → blocked` | admin action only |
| `blocked → active` | admin action only — successful auth does *not* unblock |

Enforced at login (blocked rejects even when the IdP says yes) **and on every
request** (session guard requires `active`; blocking also revokes live
sessions, so it takes effect immediately). Admins come from an
`ADMIN_EMAILS` seed (`is_admin` flag); every admin mutation writes an
`audit_log` row.

### Guest mode

The app keeps working with zero auth, exactly as today: bundled/public
architectures, local IndexedDB drafts, full editing. Login is prompted at the
save/share moment, not at startup. The catalog API serves public projects to
unauthenticated requests; the web app degrades gracefully to bundled YAMLs
when the server is unreachable.

### Authorization

Owner + `project_members` with `viewer` / `editor` roles. The role check is a
pure function over (user, project) so the same logic gates REST routes and,
later, Hocuspocus connections (viewer = read-only sync). Deferred: orgs/teams,
link-sharing, per-element permissions.

### Commit = append-only snapshots

`docStore.commit()` on a server-backed project appends a row to `snapshots`
(version, document `jsonb`, author, timestamp). History is immutable — restore
loads version N and commits it as the new head. In a shared (multiplayer)
document, commit is a shared action: any editor may commit, and the snapshot
records who did.

### Live-data proxy: cancelled

There will be **no live-data proxy**. `grafana`/`jira` data sources remain
link buttons permanently (ADR 0008's posture becomes final): no proxy, no
server-held observability tokens, no new SSRF surface. The existing opt-in,
client-side `http` polling (ADR 0005) stays as-is. This supersedes the
"live-data proxy/backend" entry in the deferred list.

### Operational floor

Zod-validated env config (fail fast at boot), `/healthz`, Drizzle migrations,
docker-compose Postgres for local dev, pg_dump backups, rate limiting on auth
endpoints. Deployment target: one container + one managed Postgres
(Fly.io/Railway/Render class).

## Consequences

- The web app gains exactly **two new boundary modules**: an API client
  (single `fetch` entry, Zod-parsed) and a Hocuspocus provider wrapper.
  `DocStore`'s API surface does not change; `y-indexeddb` stays as the
  offline cache.
- `import.meta.glob` discovery (ADR 0013) is demoted from "the catalog" to
  "the offline seed/fallback"; the ⌘K switcher merges both sources.
- Issues #37 (multiplayer) and #38 (collaborative annotations) stop being
  deferred epics and become Milestone 4 (#65–#67) on this foundation.
- We now own a server: deploys, logs, migrations, backups, and an auth
  surface. The dual-mode design quarantines that complexity at the login
  boundary — everything past the session guard is mode-agnostic.
- The repository becomes a workspace; CLAUDE.md folder rules and the
  engineering guide's repository-structure section change with #54.
