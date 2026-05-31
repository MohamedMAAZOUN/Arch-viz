// ============================================================================
// Live-data config — where the (optional) proxy lives
// ============================================================================
// The proxy base URL comes from a build-time env var, never the document.
// Grafana / Jira tokens live at that proxy, not in the client bundle.
//   VITE_LIVE_PROXY_URL=https://my-proxy.example.com/live
// Unset → grafana/jira sources are "not configured" and render offline.
// ============================================================================

export function getLiveProxyUrl(): string | null {
  // Bracket access: Vite types `import.meta.env` with a string index signature,
  // which `noPropertyAccessFromIndexSignature` requires we read this way.
  const raw: unknown = import.meta.env["VITE_LIVE_PROXY_URL"];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : null;
}
