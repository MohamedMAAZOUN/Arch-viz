import { describe, expect, it } from "vitest";

import { buildApp } from "./app";
import { loadConfig } from "./config";

import type { AppConfig } from "./config";

function testConfig(): AppConfig {
  const result = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://arch_vis:arch_vis@localhost:5432/arch_vis",
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("buildApp", () => {
  it("GET /healthz reports ok with db up", async () => {
    const app = await buildApp(testConfig(), { ping: () => Promise.resolve(true) });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "up" });
    await app.close();
  });

  it("GET /healthz still answers 200 when the database is unreachable", async () => {
    const app = await buildApp(testConfig(), { ping: () => Promise.resolve(false) });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "down" });
    await app.close();
  });

  it("rate limiting is wired (limit headers present)", async () => {
    const app = await buildApp(testConfig(), { ping: () => Promise.resolve(true) });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    await app.close();
  });
});
