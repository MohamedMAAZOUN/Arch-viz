// ============================================================================
// Auth wiring (#57, #58)
// ============================================================================
// Mounts the whole auth surface under /auth:
//   • a CSRF origin-check hook on every auth request (with SameSite=Strict it
//     is belt-and-braces, but it is what rejects a cross-origin POST that
//     somehow carries the cookie);
//   • GET  /auth/config — what modes the frontend should render;
//   • GET  /auth/me     — the current user (shared session layer);
//   • POST /auth/logout — revoke the internal session (mode-agnostic);
//   • each enabled provider's own routes (local: register/login; oidc: the
//     redirect/callback dance).
// ============================================================================

import { z } from "zod";

import { SESSION_COOKIE } from "./cookies";
import { resolveSessionUser } from "./guard";
import { createLocalAuthProvider } from "./local/provider";
import { createOidcAuthProvider } from "./oidc/provider";
import { PublicUser, toPublicUser } from "./publicUser";
import { signWsToken } from "./wsToken";
import { addOriginGuard } from "../http/csrf";

import type { AuthContext, AuthProvider } from "./types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

const PublicAuthModeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("local"), registrationEnabled: z.boolean() }),
  z.object({ mode: z.literal("oidc"), loginUrl: z.string() }),
]);

const ConfigResponse = z.object({ modes: z.array(PublicAuthModeSchema) });
const ErrorResponse = z.object({ error: z.string() });
const WsTokenResponse = z.object({ token: z.string(), expiresInMs: z.number() });

export async function registerAuth(app: FastifyInstance, ctx: AuthContext): Promise<void> {
  const providers: AuthProvider[] = [];
  if (ctx.config.auth.local.enabled) providers.push(createLocalAuthProvider(ctx));
  if (ctx.config.auth.oidc.enabled) providers.push(await createOidcAuthProvider(ctx));

  await app.register(
    async (scope) => {
      // CSRF: reject state-changing auth requests from a disallowed origin.
      addOriginGuard(scope, ctx.config.security.allowedOrigins);

      const r = scope.withTypeProvider<ZodTypeProvider>();

      r.get("/config", { schema: { response: { 200: ConfigResponse } } }, () => ({
        modes: providers.map((p) => p.publicConfig()),
      }));

      r.get(
        "/me",
        { schema: { response: { 200: z.object({ user: PublicUser }), 401: ErrorResponse } } },
        async (req, reply) => {
          const user = await resolveSessionUser(ctx, req, reply);
          if (!user) return reply.code(401).send({ error: "unauthorized" });
          return reply.code(200).send({ user: toPublicUser(user) });
        },
      );

      r.post("/logout", async (req, reply) => {
        const token = req.cookies[SESSION_COOKIE];
        if (token) await ctx.sessions.revoke(token);
        reply.clearCookie(SESSION_COOKIE, { path: "/" });
        return reply.code(204).send();
      });

      // Multiplayer handshake (#65): a short-lived signed JWT, guarded by the
      // session cookie. Hocuspocus `onAuthenticate` verifies it and runs the
      // role check — no IdP involvement, identity is internal by now.
      r.get(
        "/ws-token",
        { schema: { response: { 200: WsTokenResponse, 401: ErrorResponse } } },
        async (req, reply) => {
          const user = await resolveSessionUser(ctx, req, reply);
          if (!user) return reply.code(401).send({ error: "unauthorized" });
          const signed = signWsToken(user.id, ctx.config.session.cookieSecret, undefined, ctx.clock().getTime());
          return reply.code(200).send(signed);
        },
      );

      for (const provider of providers) await provider.registerRoutes(scope);
    },
    { prefix: "/auth" },
  );
}
