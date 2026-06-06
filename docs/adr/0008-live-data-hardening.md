# ADR-0008 — Live-data hardening (SSRF opt-in, URL allowlist) + CSP

## Status

Accepted · June 6, 2026. Supersedes parts of ADR-0005.

## Context

A security review found that the live-data feature, as built in ADR-0005, was a
**client-side SSRF / CSRF surface**. Project documents are the app's sharing
format and are loaded from untrusted sources (a `.yaml` a colleague sends you).
An element could declare `dataSources`, and `useLiveData` polled every
configured source **automatically on render, with no user consent**. For `http`
sources the URL was validated only by `z.url()` — no protocol or host
restriction. So a malicious document could make the victim's browser fire GET
requests, on load, at attacker-chosen URLs: internal/LAN services, `localhost`,
or the cloud-metadata IP (`169.254.169.254`). CORS blocks reading cross-origin
responses, but the requests still fire (GET-based CSRF, internal port probing,
a load beacon that leaks the viewer's IP).

Separately, the app shipped with **no Content-Security-Policy** — the natural
backstop should any XSS sink ever slip in.

The Grafana/Jira proxy transport from ADR-0005 was also never deployed (it was
listed as deferred), so those sources only ever rendered "offline".

## Decision

1. **Grafana / Jira become link buttons, not fetches.** They carry a
   `url` (+ optional `label`) and render as a button that opens the dashboard /
   board in a new tab (`rel="noreferrer noopener"`). Nothing is requested
   automatically, so there is no token and no proxy. The proxy transport and
   `VITE_LIVE_PROXY_URL` config are removed.

2. **`http` polling is opt-in per project.** `viewStore.liveDataEnabled`
   defaults to `false` and is reset on every `loadProject`. A freshly loaded
   document never fetches anything until the user clicks "Enable live data" in
   the inspector's Live status section. The node `LiveIndicator` shows nothing
   until then.

3. **URLs are allowlisted to public http(s).** `isPublicHttpUrl` (`@/lib/safeUrl`,
   pure) rejects non-http(s) protocols and loopback / private / link-local /
   cloud-metadata hosts (including non-dotted IPv4 encodings and IPv4-mapped
   IPv6). It is enforced at the schema boundary (`SafeHttpUrl`) **and**
   re-checked in `LiveDataClient` right before the fetch (defense in depth).

4. **Content-Security-Policy on the production build.** A build-only Vite plugin
   injects a CSP `<meta>` into `index.html`, hashing the inline anti-flash
   script so `script-src` needs no `'unsafe-inline'`. `style-src` keeps
   `'unsafe-inline'` (React Flow / Motion set inline style attributes — far
   lower risk than script); `connect-src 'self' https:` permits opted-in live
   data. Build-only because a strict CSP breaks Vite's dev HMR.

## Consequences

- Schema change (not backward compatible): `grafana`/`jira` sources now use
  `url`/`label` instead of `query`/`jql`/`binding`. Example and scale-test
  YAMLs and the generator scripts are updated. `$schemaVersion` stays `1.0.0`
  because the previous live-data shape never shipped a released document.
- Hostname-based blocking is imperfect against DNS rebinding and exotic
  encodings, but it is solid defense-in-depth for a static SPA and closes the
  obvious holes. The per-project opt-in is the primary control.
- CSP via `<meta>` cannot express `frame-ancestors` (needs a real header, which
  GitHub Pages can't set); clickjacking protection is therefore out of scope
  here and noted for any future custom-host deployment.
