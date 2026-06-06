# ADR-0005 — Live data hooks (Grafana / Jira / HTTP)

## Status

Accepted · May 31, 2026 — **partially superseded by ADR-0008** (June 6, 2026):
the Grafana/Jira proxy transport is removed (they are now link buttons) and
`http` polling is gated behind an explicit per-project opt-in with URL
allowlisting. The boundary/wrapping principles below still hold.

## Context

Elements may declare `dataSources` (`grafana` | `jira` | `http`, each with a
`binding` of `status` | `badge` | `metric` | `label`). The inspector listed
them read-only; nothing fetched (issue #3). The blocking unknown was
CORS/auth: Grafana and Jira Data Center need a token and won't allow direct
browser calls, and this is a **frontend-only SPA** with a hard rule that
**secrets never live in the document or the client bundle**.

## Decision

Build the full client architecture now, with a **real-only** transport (no
synthesized data — chosen with the user):

- **Boundary — `core/live/LiveDataClient.ts`.** Every live fetch enters one
  module behind a typed interface (`isConfigured`, `fetchBinding → Result<LiveValue>`),
  with `fetch` injectable for tests. Transports:
  - `http` → fetched directly in the browser (works for CORS-friendly,
    token-free endpoints), with optional `jsonPath` extraction.
  - `grafana` / `jira` → routed through a proxy at `VITE_LIVE_PROXY_URL`. The
    proxy holds the token; the client sends only the query/jql. **No proxy
    configured → the source is "not configured"** and renders offline. A secret
    never touches the document or the bundle.
- **Pure helpers** (each unit-tested): `jsonPath.extractPath`,
  `mapValue.toLiveValue` / `coerceStatus` (map raw values onto the binding),
  `backoff.nextDelay` (exponential backoff), and `useLiveData.combineLive`
  (fold a fetch round into a snapshot).
- **Polling — `core/live/useLiveData(element)`.** Polls every configured source
  on a 20s base interval, doubling to a 5-min cap on consecutive failures and
  resetting on success. Keeps the last-known value and marks it **stale** on a
  failed refresh; reports **error** only when there's nothing to show; sources
  with no transport resolve immediately to **offline** (no pointless timers).
  One hook feeds both surfaces.
- **Surfacing.** A compact `LiveIndicator` (status dot + first value chip) sits
  on every node (`ElementNode` and `GroupNode`) that has data sources; the
  inspector's "Live status" section shows the same snapshot (state label,
  status, chips) plus the configured-source list. Fetch failures degrade
  gracefully — the canvas never crashes.

## Consequences

What gets easier:
- The architecture is complete and testable; turning on real data is just
  setting `VITE_LIVE_PROXY_URL` (for Grafana/Jira) or pointing an `http` source
  at a CORS-friendly endpoint — no code change.
- Graceful degradation is built in: offline / stale / error are first-class
  visual states, so a flaky or unconfigured backend is obvious, not a crash.

What we accept:
- Out of the box (no proxy), the bundled examples' Grafana/Jira sources render
  "offline" — honest, but the public demo shows live updates only once a proxy
  is wired up. (The user chose real-only over a demo simulator.)
- The proxy contract is intentionally thin (`POST {proxyUrl}/{kind}` with
  `{ query | jql, binding }`, responding `{ value }`); standing one up is out
  of scope for this repo.
- Each node with sources runs its own poll. Fine at current scale; a shared
  scheduler/dedupe is a later optimization if needed.

## Alternatives considered

- **Demo/simulated provider by default** so the deployed demo visibly updates.
  Offered but not chosen — the user preferred no fabricated data.
- **Direct browser calls to Grafana/Jira.** Impossible in practice (CORS + a
  token that would have to ship in the bundle). The proxy is the only way that
  honors the secrets rule.
- **A backend in this repo.** Out of scope; the app stays frontend-only and
  defers the proxy to deployment.
