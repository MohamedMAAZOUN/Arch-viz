// ============================================================================
// API boundary — the single `fetch` entry for the backend (ADR 0014)
// ============================================================================
// Every call to `/auth/*` and `/projects/*` goes through this module (issue
// #63/#64: "one client module with Zod parsing"). It is the web-side analogue
// of the server's repository boundary and the wrapper rule: no other file calls
// `fetch` for the app API (the live-data poller in `core/live` is a separate,
// user-data boundary).
//
// Responsibilities:
//   • prefix the configured base URL, always send the session cookie;
//   • parse every successful response with a caller-supplied Zod schema
//     (principle 4: boundaries validate — the server is trusted code, but the
//     wire is still a boundary, so we re-validate here);
//   • turn transport/HTTP failures into a typed `Result<T, ApiError>` instead
//     of throwing;
//   • surface a session-expired 401 to a single registered handler so a token
//     that dies mid-session can prompt re-login without losing the local draft.
// ============================================================================

import { err, ok, type Result } from "@/core/errors";

import type { z } from "zod";

/** A typed API failure. `kind` lets callers branch without string-matching. */
export type ApiError =
  | { readonly kind: "network"; readonly message: string }
  | { readonly kind: "unauthorized"; readonly message: string }
  | { readonly kind: "forbidden"; readonly message: string }
  | { readonly kind: "not_found"; readonly message: string }
  | { readonly kind: "conflict"; readonly message: string }
  | { readonly kind: "unprocessable"; readonly message: string }
  | { readonly kind: "server"; readonly status: number; readonly message: string }
  | { readonly kind: "parse"; readonly message: string };

export type ApiResult<T> = Result<T, ApiError>;

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface RequestConfig<T> {
  readonly method?: HttpMethod;
  readonly body?: unknown;
  /** Zod schema for a JSON success body. Omit for no-content (204) responses. */
  readonly schema?: z.ZodType<T>;
  readonly signal?: AbortSignal;
}

export interface HttpClient {
  /** Issue a request and parse the JSON body with `schema`. */
  request<T>(path: string, config: RequestConfig<T>): Promise<ApiResult<T>>;
  /** Issue a request that returns no body (204). */
  requestVoid(
    path: string,
    config?: Omit<RequestConfig<undefined>, "schema">,
  ): Promise<ApiResult<undefined>>;
}

export interface HttpClientOptions {
  readonly baseUrl: string;
  readonly fetchImpl: FetchLike;
  /** Called whenever a request returns 401. The session layer decides if this
   *  is a guest probe (ignore) or a live session that just expired (re-login). */
  readonly onUnauthorized?: () => void;
}

/** Map an HTTP status to a typed error, reading the server's `{ error }` body. */
function errorForStatus(status: number, serverMessage: string): ApiError {
  const message = serverMessage || `HTTP ${String(status)}`;
  switch (status) {
    case 401:
      return { kind: "unauthorized", message };
    case 403:
      return { kind: "forbidden", message };
    case 404:
      return { kind: "not_found", message };
    case 409:
      return { kind: "conflict", message };
    case 422:
      return { kind: "unprocessable", message };
    default:
      return { kind: "server", status, message };
  }
}

/** Best-effort read of the server's `{ error: string }` envelope. */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body) {
      const value = (body as { error: unknown }).error;
      if (typeof value === "string") return value;
    }
  } catch {
    // Non-JSON or empty error body — fall back to the status text.
  }
  return res.statusText;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { baseUrl, fetchImpl, onUnauthorized } = options;

  async function send(path: string, config: RequestConfig<unknown>): Promise<Response | ApiError> {
    const method = config.method ?? "GET";
    const init: RequestInit = {
      method,
      // Always carry the httpOnly session cookie (cross-origin in dev).
      credentials: "include",
      headers:
        config.body === undefined ? {} : { "content-type": "application/json" },
      ...(config.body === undefined ? {} : { body: JSON.stringify(config.body) }),
      ...(config.signal ? { signal: config.signal } : {}),
    };
    try {
      return await fetchImpl(`${baseUrl}${path}`, init);
    } catch (e) {
      return { kind: "network", message: e instanceof Error ? e.message : "network error" };
    }
  }

  async function request<T>(path: string, config: RequestConfig<T>): Promise<ApiResult<T>> {
    const res = await send(path, config);
    if ("kind" in res) return err(res);

    if (res.status === 401) onUnauthorized?.();

    if (!res.ok) {
      return err(errorForStatus(res.status, await readErrorMessage(res)));
    }

    if (config.schema === undefined) {
      // Caller expects no body; resolve undefined as the (void) value.
      return ok(undefined as T);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (e) {
      return err({ kind: "parse", message: e instanceof Error ? e.message : "invalid JSON" });
    }
    const parsed = config.schema.safeParse(json);
    if (!parsed.success) {
      return err({ kind: "parse", message: parsed.error.message });
    }
    return ok(parsed.data);
  }

  return {
    request,
    requestVoid: (path, config) => request<undefined>(path, { ...config }),
  };
}

// ----------------------------------------------------------------------------
// Default singleton — wired to the global fetch and the configured base URL.
// ----------------------------------------------------------------------------

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

let unauthorizedHandler: (() => void) | null = null;

/** Register the single 401 handler (the session layer). Replaces any prior. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export const http: HttpClient = createHttpClient({
  baseUrl: API_BASE_URL,
  fetchImpl: (input, init) => fetch(input, init),
  onUnauthorized: () => unauthorizedHandler?.(),
});
