// Integration tests for the local-auth surface (issue #57), exercising the real
// providers through app.inject() against the in-memory repository. State-changing
// requests carry an Origin header matching WEB_ORIGIN so the CSRF check passes;
// one test deliberately sends a bad origin to prove it is rejected.

import { describe, expect, it } from "vitest";

import { buildApp } from "../app";
import { loadConfig } from "../config";
import { createMemoryRepository } from "../db/repository";

import type { AppConfig } from "../config";
import type { Repository } from "../db/repository";
import type { InjectOptions, LightMyRequestResponse } from "fastify";

const ORIGIN = "http://localhost:5173";

function testConfig(over: Record<string, string> = {}): AppConfig {
  const result = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://arch_vis:arch_vis@localhost:5432/arch_vis",
    WEB_ORIGIN: ORIGIN,
    ...over,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function setup(configOverride: Record<string, string> = {}) {
  const repo: Repository = createMemoryRepository();
  const app = await buildApp(testConfig(configOverride), {
    db: { ping: () => Promise.resolve(true) },
    repo,
  });
  return { app, repo };
}

const post = (
  url: string,
  payload?: InjectOptions["payload"],
  extra: { headers?: Record<string, string> } = {},
): InjectOptions => ({
  method: "POST",
  url,
  headers: { origin: ORIGIN, ...(extra.headers ?? {}) },
  ...(payload !== undefined ? { payload } : {}),
});

function sessionCookie(res: LightMyRequestResponse): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "arch_vis_session");
  return cookie?.value ? `arch_vis_session=${cookie.value}` : undefined;
}

describe("auth surface", () => {
  it("GET /auth/config lists the local mode", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/auth/config" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ modes: [{ mode: "local", registrationEnabled: true }] });
    await app.close();
  });

  it("register → me → logout round-trips, and login works too", async () => {
    const { app } = await setup();

    const reg = await app.inject(
      post("/auth/register", {
        email: "alice@example.com",
        password: "password123",
        displayName: "Alice",
      }),
    );
    expect(reg.statusCode).toBe(201);
    expect(reg.json<{ user: { email: string } }>().user.email).toBe("alice@example.com");
    const cookie = sessionCookie(reg);
    expect(cookie).toBeDefined();

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookie! } });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ user: { email: string } }>().user.email).toBe("alice@example.com");

    const logout = await app.inject(
      post("/auth/logout", undefined, { headers: { cookie: cookie! } }),
    );
    expect(logout.statusCode).toBe(204);

    // The cookie now points at a revoked session.
    const after = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookie! },
    });
    expect(after.statusCode).toBe(401);

    // And login issues a fresh working session.
    const login = await app.inject(
      post("/auth/login", { email: "alice@example.com", password: "password123" }),
    );
    expect(login.statusCode).toBe(200);
    const me2 = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: sessionCookie(login)! },
    });
    expect(me2.statusCode).toBe(200);

    await app.close();
  });

  it("GET /auth/me without a cookie is 401", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("login with a wrong password is 401", async () => {
    const { app } = await setup();
    await app.inject(post("/auth/register", { email: "bob@example.com", password: "password123" }));
    const res = await app.inject(
      post("/auth/login", { email: "bob@example.com", password: "wrong-password" }),
    );
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects a cross-origin state-changing request even with a valid cookie", async () => {
    const { app } = await setup();
    const reg = await app.inject(
      post("/auth/register", { email: "eve@example.com", password: "password123" }),
    );
    const cookie = sessionCookie(reg)!;

    const res = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { origin: "https://evil.example", cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: string }>().error).toBe("origin_not_allowed");
    await app.close();
  });

  it("rejects a state-changing request with no Origin header", async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "x@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("a blocked user is rejected at login and on every request", async () => {
    const { app, repo } = await setup();
    const reg = await app.inject(
      post("/auth/register", { email: "carol@example.com", password: "password123" }),
    );
    const cookie = sessionCookie(reg)!;
    const user = await repo.users.findByEmail("carol@example.com");
    await repo.users.setStatus(user!.id, "blocked");

    // The live session cookie no longer works (guard requires active).
    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);

    // And a fresh login with the correct password is forbidden.
    const login = await app.inject(
      post("/auth/login", { email: "carol@example.com", password: "password123" }),
    );
    expect(login.statusCode).toBe(403);
    await app.close();
  });

  it("disabling registration removes the route and reflects in /auth/config", async () => {
    const { app } = await setup({ AUTH_REGISTRATION_ENABLED: "false" });
    const cfg = await app.inject({ method: "GET", url: "/auth/config" });
    expect(cfg.json()).toEqual({ modes: [{ mode: "local", registrationEnabled: false }] });

    const reg = await app.inject(
      post("/auth/register", { email: "no@example.com", password: "password123" }),
    );
    expect(reg.statusCode).toBe(404);
    await app.close();
  });
});
