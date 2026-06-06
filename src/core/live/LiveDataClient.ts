// ============================================================================
// LiveDataClient — the single network boundary for live data
// ============================================================================
// Only `http` sources are fetched, and only directly in the browser (works for
// CORS-friendly, token-free endpoints) with optional jsonPath extraction.
//
// `grafana` / `jira` sources are NOT fetched: they render as link buttons that
// open the dashboard/board in a new tab (see the inspector's Live status
// section). So there is no proxy and no token in the client.
//
// Defense in depth: every URL was already constrained to a public http(s)
// endpoint at the schema boundary (`SafeHttpUrl`); we re-check here right before
// the fetch so this boundary is safe even if a caller skips validation.
//
// `fetch` is injectable so the routing can be unit-tested without the network.
// ============================================================================

import { err, ok } from "@/core/errors";
import { extractPath } from "@/core/live/jsonPath";
import { toLiveValue } from "@/core/live/mapValue";
import { isPublicHttpUrl } from "@/lib/safeUrl";

import type { Result } from "@/core/errors";
import type { LiveValue } from "@/core/live/types";
import type { DataSource } from "@/core/schema/schema";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface LiveDataClient {
  /** Whether this source is polled for live data (only `http` sources are). */
  isConfigured: (source: DataSource) => boolean;
  /** Fetch and interpret the source's value for its binding. */
  fetchBinding: (source: DataSource) => Promise<Result<LiveValue>>;
}

export class HttpLiveDataClient implements LiveDataClient {
  constructor(private readonly fetchImpl: FetchLike) {}

  isConfigured(source: DataSource): boolean {
    return source.kind === "http";
  }

  async fetchBinding(source: DataSource): Promise<Result<LiveValue>> {
    if (source.kind !== "http") {
      // grafana/jira are link buttons, never polled.
      return err("Source is not a live (http) source.");
    }
    try {
      const raw = await this.fetchRaw(source.url, source.jsonPath);
      if (!raw.ok) return raw;
      const value = toLiveValue(source.binding, raw.value);
      return value !== null ? ok(value) : err("Response didn't match the binding.");
    } catch (e) {
      return err(e instanceof Error ? e.message : "fetch failed");
    }
  }

  private async fetchRaw(url: string, jsonPath: string | undefined): Promise<Result<unknown>> {
    // Re-validate at the network boundary, not just at the schema boundary.
    if (!isPublicHttpUrl(url)) return err("Refusing to fetch a non-public URL.");
    const res = await this.fetchImpl(url);
    if (!res.ok) return err(`HTTP ${String(res.status)}`);
    const json: unknown = await res.json();
    return ok(jsonPath !== undefined ? extractPath(json, jsonPath) : json);
  }
}

export const liveDataClient: LiveDataClient = new HttpLiveDataClient((input, init) =>
  fetch(input, init),
);
