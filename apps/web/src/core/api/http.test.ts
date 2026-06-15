import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createHttpClient, type FetchLike } from "@/core/api/http";

const Schema = z.object({ value: z.string() });

function clientWith(fetchImpl: FetchLike, onUnauthorized?: () => void) {
  return createHttpClient({ baseUrl: "http://api.test", fetchImpl, ...(onUnauthorized ? { onUnauthorized } : {}) });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("http client", () => {
  it("parses a successful body with the schema", async () => {
    const client = clientWith(() => Promise.resolve(jsonResponse({ value: "ok" })));
    const result = await client.request("/x", { schema: Schema });
    expect(result).toEqual({ ok: true, value: { value: "ok" } });
  });

  it("prefixes the base url and forwards the method/body", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({ value: "ok" })));
    await clientWith(fetchImpl).request("/projects/", { method: "POST", body: { a: 1 }, schema: Schema });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/projects/",
      expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify({ a: 1 }) }),
    );
  });

  it("maps a 401 to an unauthorized error and fires the handler", async () => {
    const onUnauthorized = vi.fn();
    const client = clientWith(() => Promise.resolve(jsonResponse({ error: "unauthorized" }, 401)), onUnauthorized);
    const result = await client.request("/auth/me", { schema: Schema });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unauthorized");
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("maps statuses to typed error kinds and carries the server message", async () => {
    const cases: readonly [number, string][] = [
      [403, "forbidden"],
      [404, "not_found"],
      [409, "conflict"],
      [422, "unprocessable"],
    ];
    for (const [status, kind] of cases) {
      const client = clientWith(() => Promise.resolve(jsonResponse({ error: "account_blocked" }, status)));
      const result = await client.request("/x", { schema: Schema });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe(kind);
        expect(result.error.message).toBe("account_blocked");
      }
    }
  });

  it("returns a network error when fetch throws", async () => {
    const client = clientWith(() => Promise.reject(new Error("offline")));
    const result = await client.request("/x", { schema: Schema });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "network", message: "offline" });
  });

  it("returns a parse error when the body doesn't match the schema", async () => {
    const client = clientWith(() => Promise.resolve(jsonResponse({ value: 123 })));
    const result = await client.request("/x", { schema: Schema });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("parse");
  });

  it("resolves no-content requests without a schema", async () => {
    const client = clientWith(() => Promise.resolve(new Response(null, { status: 204 })));
    const result = await client.requestVoid("/auth/logout", { method: "POST" });
    expect(result).toEqual({ ok: true, value: undefined });
  });
});
