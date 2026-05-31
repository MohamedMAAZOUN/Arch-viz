// ============================================================================
// liveData.test.ts — pure helpers + client transport routing
// ============================================================================

import { describe, expect, it, vi } from "vitest";

import { HttpLiveDataClient } from "@/core/live/LiveDataClient";
import { nextDelay } from "@/core/live/backoff";
import { extractPath } from "@/core/live/jsonPath";
import { coerceStatus, toLiveValue } from "@/core/live/mapValue";
import { combineLive } from "@/core/live/useLiveData";

import type { LiveSnapshot } from "@/core/live/useLiveData";
import type { DataSource } from "@/core/schema/schema";

// -- jsonPath ----------------------------------------------------------------

describe("extractPath", () => {
  it("walks dotted + indexed paths", () => {
    const obj = { data: { result: [{ value: 42 }, { value: 7 }] } };
    expect(extractPath(obj, "data.result[0].value")).toBe(42);
    expect(extractPath(obj, "data.result[1].value")).toBe(7);
  });

  it("returns undefined on a miss instead of throwing", () => {
    expect(extractPath({ a: 1 }, "a.b.c")).toBeUndefined();
    expect(extractPath(null, "a")).toBeUndefined();
  });
});

// -- mapValue ----------------------------------------------------------------

describe("coerceStatus", () => {
  it("maps common health vocabularies", () => {
    expect(coerceStatus("up")).toBe("ok");
    expect(coerceStatus("degraded")).toBe("warn");
    expect(coerceStatus("DOWN")).toBe("critical");
    expect(coerceStatus(1)).toBe("ok");
    expect(coerceStatus(0)).toBe("critical");
    expect(coerceStatus("weird")).toBe("unknown");
  });
});

describe("toLiveValue", () => {
  it("coerces metric to a finite number or fails", () => {
    expect(toLiveValue("metric", "12.5")).toEqual({ binding: "metric", value: 12.5 });
    expect(toLiveValue("metric", "not-a-number")).toBeNull();
  });

  it("builds status with optional text", () => {
    expect(toLiveValue("status", "up")).toEqual({ binding: "status", status: "ok", text: "up" });
  });

  it("requires text for badge/label", () => {
    expect(toLiveValue("badge", { x: 1 })).toBeNull();
    expect(toLiveValue("label", "v2.3.1")).toEqual({ binding: "label", text: "v2.3.1" });
  });
});

// -- backoff -----------------------------------------------------------------

describe("nextDelay", () => {
  it("returns base with no failures and doubles up to a cap", () => {
    expect(nextDelay(0, 1000, 60_000)).toBe(1000);
    expect(nextDelay(1, 1000, 60_000)).toBe(2000);
    expect(nextDelay(3, 1000, 60_000)).toBe(8000);
    expect(nextDelay(20, 1000, 60_000)).toBe(60_000); // capped
  });
});

// -- combineLive -------------------------------------------------------------

const EMPTY: LiveSnapshot = { state: "loading", status: null, chips: [], error: null };

describe("combineLive", () => {
  it("reports ok with status + chips on a clean fetch", () => {
    const snap = combineLive(
      [
        { binding: "status", status: "ok" },
        { binding: "metric", value: 99, unit: "rps" },
      ],
      false,
      EMPTY,
    );
    expect(snap.state).toBe("ok");
    expect(snap.status).toBe("ok");
    expect(snap.chips).toEqual([{ binding: "metric", text: "99 rps" }]);
  });

  it("keeps the last-known value and marks stale when a refresh fails", () => {
    const prior: LiveSnapshot = {
      state: "ok",
      status: "ok",
      chips: [{ binding: "metric", text: "99" }],
      error: null,
    };
    const snap = combineLive([], false, prior);
    expect(snap.state).toBe("stale");
    expect(snap.status).toBe("ok"); // retained
  });

  it("reports error when there's nothing to show", () => {
    const snap = combineLive([], false, EMPTY);
    expect(snap.state).toBe("error");
  });
});

// -- HttpLiveDataClient routing ----------------------------------------------

function jsonResponse(body: unknown, okFlag = true, status = 200): Response {
  // Minimal stand-in for Response — only the fields the client reads.
  return {
    ok: okFlag,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function bodyString(init: RequestInit | undefined): string {
  return typeof init?.body === "string" ? init.body : "";
}

describe("HttpLiveDataClient", () => {
  it("fetches http sources directly with jsonPath extraction", async () => {
    const fetchImpl = vi.fn((_input: string, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ data: { value: "healthy" } })),
    );
    const client = new HttpLiveDataClient(null, fetchImpl);
    const source: DataSource = {
      kind: "http",
      url: "https://example.com/health",
      jsonPath: "data.value",
      binding: "status",
    };

    const result = await client.fetchBinding(source);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ binding: "status", status: "ok", text: "healthy" });
    }
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com/health");
  });

  it("treats grafana/jira as not configured without a proxy", async () => {
    const fetchImpl = vi.fn((_input: string, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({})),
    );
    const client = new HttpLiveDataClient(null, fetchImpl);
    const source: DataSource = { kind: "grafana", query: "up", binding: "status" };

    expect(client.isConfigured(source)).toBe(false);
    const result = await client.fetchBinding(source);
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("routes grafana through the proxy when configured (no secrets sent)", async () => {
    const fetchImpl = vi.fn((_input: string, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ value: 42 })),
    );
    const client = new HttpLiveDataClient("https://proxy.example.com/live", fetchImpl);
    const source: DataSource = { kind: "grafana", query: "gateway_rps", binding: "metric" };

    const result = await client.fetchBinding(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ binding: "metric", value: 42 });

    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe("https://proxy.example.com/live/grafana");
    const body = bodyString(call?.[1]);
    expect(body).toContain("gateway_rps");
    expect(body).not.toContain("token");
  });
});
