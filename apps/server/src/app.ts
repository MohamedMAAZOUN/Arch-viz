// ============================================================================
// Fastify application factory
// ============================================================================
// Pure construction: given a validated config and the dependencies (a DB health
// probe, the repository, and an optional clock), return a configured (not yet
// listening) Fastify instance. Tests build the app with an in-memory repository
// and use `app.inject()` — no sockets, no Postgres.
//
// Zod is wired as the type provider so every route declares its request/response
// schemas with the same library that guards every other boundary in this
// codebase. Cookies are parsed/signed by @fastify/cookie, and the auth surface
// (config/me/logout + the enabled providers) is mounted under /auth.
// ============================================================================

import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

import { registerAdmin } from "./admin/registerAdmin";
import { createAuthContext } from "./auth/context";
import { registerAuth } from "./auth/registerAuth";
import { registerProjects } from "./projects/registerProjects";

import type { Clock } from "./auth/clock";
import type { AppConfig } from "./config";
import type { AppDb } from "./db";
import type { Repository } from "./db/repository";
import type { FastifyInstance } from "fastify";

/** The slice of AppDb the HTTP layer needs. Tests stub this. */
export type HealthProbe = Pick<AppDb, "ping">;

export interface BuildAppDeps {
  readonly db: HealthProbe;
  readonly repo: Repository;
  /** Injectable in tests to make session expiry/rotation deterministic. */
  readonly clock?: Clock;
}

const HealthResponse = z.object({
  status: z.literal("ok"),
  db: z.enum(["up", "down"]),
});

export async function buildApp(config: AppConfig, deps: BuildAppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.env !== "test",
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cookie, { secret: config.session.cookieSecret });

  // Generous global ceiling; auth routes set their own, much tighter limits.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });

  app.get("/healthz", { schema: { response: { 200: HealthResponse } } }, async () => ({
    status: "ok" as const,
    db: (await deps.db.ping()) ? ("up" as const) : ("down" as const),
  }));

  const authContext = createAuthContext(config, deps.repo, deps.clock);
  await registerAuth(app, authContext);
  await registerProjects(app, authContext);
  await registerAdmin(app, authContext);

  return app;
}
