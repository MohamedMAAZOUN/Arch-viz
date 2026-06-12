// ============================================================================
// Fastify application factory
// ============================================================================
// Pure construction: given a validated config and a DB handle, return a
// configured (not yet listening) Fastify instance. Tests build the app with a
// stub AppDb and use `app.inject()` — no sockets, no Postgres.
//
// Zod is wired as the type provider so every route added by later issues
// declares its request/response schemas with the same library that guards
// every other boundary in this codebase.
// ============================================================================

import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

import type { AppConfig } from "./config";
import type { AppDb } from "./db";
import type { FastifyInstance } from "fastify";

/** The slice of AppDb the HTTP layer needs. Tests stub this. */
export type HealthProbe = Pick<AppDb, "ping">;

const HealthResponse = z.object({
  status: z.literal("ok"),
  db: z.enum(["up", "down"]),
});

export async function buildApp(
  config: AppConfig,
  db: HealthProbe,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.env !== "test",
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Generous global ceiling; auth routes get their own, much tighter limits
  // when they land (#57).
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });

  app.get(
    "/healthz",
    { schema: { response: { 200: HealthResponse } } },
    async () => ({
      status: "ok" as const,
      db: (await db.ping()) ? ("up" as const) : ("down" as const),
    }),
  );

  return app;
}
