// ============================================================================
// LiveDataClient — the single network boundary for live data
// ============================================================================
// Every live-data fetch enters here, wrapped like our other external deps.
// Transports:
//   - http   → fetched directly in the browser (works for CORS-friendly,
//              token-free endpoints), with optional jsonPath extraction.
//   - grafana / jira → routed through a proxy (VITE_LIVE_PROXY_URL). The proxy
//              holds the token; the client only ever sends the query/jql.
//              With no proxy configured, these sources are "not configured" —
//              we never embed a secret in the document or the bundle.
//
// `fetch` is injectable so the routing can be unit-tested without the network.
// ============================================================================

import { err, ok } from "@/core/errors";
import { getLiveProxyUrl } from "@/core/live/config";
import { extractPath } from "@/core/live/jsonPath";
import { toLiveValue } from "@/core/live/mapValue";

import type { Result } from "@/core/errors";
import type { LiveValue } from "@/core/live/types";
import type { DataSource } from "@/core/schema/schema";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface LiveDataClient {
  /** Whether a transport exists for this source (http always; proxy kinds need a proxy). */
  isConfigured: (source: DataSource) => boolean;
  /** Fetch and interpret the source's value for its binding. */
  fetchBinding: (source: DataSource) => Promise<Result<LiveValue>>;
}

export class HttpLiveDataClient implements LiveDataClient {
  constructor(
    private readonly proxyUrl: string | null,
    private readonly fetchImpl: FetchLike,
  ) {}

  isConfigured(source: DataSource): boolean {
    return source.kind === "http" ? true : this.proxyUrl !== null;
  }

  async fetchBinding(source: DataSource): Promise<Result<LiveValue>> {
    try {
      const raw = await this.fetchRaw(source);
      if (!raw.ok) return raw;
      const value = toLiveValue(source.binding, raw.value);
      return value !== null ? ok(value) : err("Response didn't match the binding.");
    } catch (e) {
      return err(e instanceof Error ? e.message : "fetch failed");
    }
  }

  private async fetchRaw(source: DataSource): Promise<Result<unknown>> {
    if (source.kind === "http") {
      const res = await this.fetchImpl(source.url);
      if (!res.ok) return err(`HTTP ${String(res.status)}`);
      const json: unknown = await res.json();
      return ok(source.jsonPath !== undefined ? extractPath(json, source.jsonPath) : json);
    }

    // grafana | jira → proxy
    if (this.proxyUrl === null) return err("No live-data proxy configured.");
    const res = await this.fetchImpl(`${this.proxyUrl}/${source.kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proxyPayload(source)),
    });
    if (!res.ok) return err(`Proxy HTTP ${String(res.status)}`);
    const json: unknown = await res.json();
    // The proxy returns { value: <raw> }.
    return ok((json as { value?: unknown }).value);
  }
}

function proxyPayload(source: DataSource): Record<string, unknown> {
  switch (source.kind) {
    case "grafana":
      return { query: source.query, binding: source.binding };
    case "jira":
      return { jql: source.jql, binding: source.binding };
    case "http":
      return { url: source.url, binding: source.binding };
  }
}

export const liveDataClient: LiveDataClient = new HttpLiveDataClient(
  getLiveProxyUrl(),
  (input, init) => fetch(input, init),
);
