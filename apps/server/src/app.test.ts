import { describe, expect, it } from "vitest";

import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createMemoryRepository } from "./db/repository";

import type { AppConfig } from "./config";

function testConfig(): AppConfig {
  const result = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://arch_vis:arch_vis@localhost:5432/arch_vis",
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const deps = (ping: boolean) => ({
  db: { ping: () => Promise.resolve(ping) },
  repo: createMemoryRepository(),
});

describe("buildApp", () => {
  it("GET /healthz reports ok with db up", async () => {
    const app = await buildApp(testConfig(), deps(true));
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "up" });
    await app.close();
  });

  it("GET /healthz still answers 200 when the database is unreachable", async () => {
    const app = await buildApp(testConfig(), deps(false));
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "down" });
    await app.close();
  });

  it("rate limiting is wired (limit headers present)", async () => {
    const app = await buildApp(testConfig(), deps(true));
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    await app.close();
  });
});
