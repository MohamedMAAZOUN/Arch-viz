// Shared test helpers: build the app against the in-memory repository and drive
// it through app.inject(). Not a test file itself (no `.test.` suffix), so the
// vitest include pattern skips it. State-changing requests carry the allowed
// Origin so the CSRF guard passes.

import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createMemoryRepository } from "./db/repository";

import type { AppConfig } from "./config";
import type { Repository } from "./db/repository";
import type { ProjectDocument } from "@arch-vis/schema";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";

export const ORIGIN = "http://localhost:5173";

export function testConfig(over: Record<string, string> = {}): AppConfig {
  const result = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://arch_vis:arch_vis@localhost:5432/arch_vis",
    WEB_ORIGIN: ORIGIN,
    ...over,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export async function setup(
  over: Record<string, string> = {},
): Promise<{ app: FastifyInstance; repo: Repository }> {
  const repo = createMemoryRepository();
  const app = await buildApp(testConfig(over), {
    db: { ping: () => Promise.resolve(true) },
    repo,
  });
  return { app, repo };
}

interface WithBody {
  readonly cookie?: string;
  readonly payload?: InjectOptions["payload"];
}

const build = (
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  opts: WithBody = {},
): InjectOptions => ({
  method,
  url,
  headers: {
    origin: ORIGIN,
    ...(opts.cookie ? { cookie: opts.cookie } : {}),
  },
  ...(opts.payload !== undefined ? { payload: opts.payload } : {}),
});

export const post = (url: string, opts?: WithBody) => build("POST", url, opts);
export const patch = (url: string, opts?: WithBody) => build("PATCH", url, opts);
export const del = (url: string, opts?: WithBody) => build("DELETE", url, opts);
export const get = (url: string, cookie?: string): InjectOptions => ({
  method: "GET",
  url,
  ...(cookie ? { headers: { cookie } } : {}),
});

export function sessionCookie(res: LightMyRequestResponse): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "arch_vis_session");
  return cookie?.value ? `arch_vis_session=${cookie.value}` : undefined;
}

/** Register a user and return their session cookie + id. */
export async function registerUser(
  app: FastifyInstance,
  email: string,
  password = "password123",
): Promise<{ cookie: string; id: string }> {
  const res = await app.inject(post("/auth/register", { payload: { email, password } }));
  if (res.statusCode !== 201) {
    throw new Error(`register failed: ${String(res.statusCode)} ${res.body}`);
  }
  const cookie = sessionCookie(res);
  if (!cookie) throw new Error("register returned no session cookie");
  return { cookie, id: res.json<{ user: { id: string } }>().user.id };
}

/** A minimal document that passes the shared ProjectDocument schema. */
export function validDocument(name = "Demo"): ProjectDocument {
  return {
    $schemaVersion: "1.0.0",
    project: { id: "demo", name, theme: "default" },
    mvps: [{ id: "mvp1", name: "MVP 1", order: 1, color: "#112233" }],
    layers: [
      { id: "business", order: 1, label: "Business" },
      { id: "architecture", order: 2, label: "Architecture" },
      { id: "engineering", order: 3, label: "Engineering" },
    ],
    elements: [],
    connections: [],
  } as ProjectDocument;
}
