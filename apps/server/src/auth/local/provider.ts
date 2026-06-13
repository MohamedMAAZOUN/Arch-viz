// ============================================================================
// Local auth provider — email/password (ADR 0014, #57)
// ============================================================================
// Registers /auth/register (env-toggleable) and /auth/login. Passwords are
// argon2id-hashed; login is rate-limited and runs a constant dummy verify when
// the account or its credentials are missing, so response timing does not leak
// which emails exist. A successful login mints the shared internal session and
// self-heals a `disabled` account back to `active` (but never a `blocked` one).
// ============================================================================

import { z } from "zod";

import { issueSession } from "../guard";
import { hashPassword, verifyPassword } from "../password";
import { PublicUser, toPublicUser } from "../publicUser";

import type { AuthContext, AuthProvider } from "../types";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

// A precomputed argon2id hash used only to spend comparable CPU time when an
// account/credential is absent (anti-enumeration). Its plaintext is unknown.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$Zp6Pb92Q2CPlU6VF1kccmQ$iax5GlRGJ6hc68WUXg7spY1l1SHuYVebr9cYYp+OY2s";

const ErrorResponse = z.object({ error: z.string() });

const Credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(1024),
});

const RegisterBody = Credentials.extend({
  displayName: z.string().min(1).max(120).optional(),
});

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export function createLocalAuthProvider(ctx: AuthContext): AuthProvider {
  return {
    id: "local",
    publicConfig: () => ({
      mode: "local",
      registrationEnabled: ctx.config.auth.local.registrationEnabled,
    }),

    registerRoutes(app) {
      const r = app.withTypeProvider<ZodTypeProvider>();

      if (ctx.config.auth.local.registrationEnabled) {
        r.post(
          "/register",
          {
            config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
            schema: {
              body: RegisterBody,
              response: { 201: z.object({ user: PublicUser }), 409: ErrorResponse },
            },
          },
          async (req, reply) => {
            const email = normalizeEmail(req.body.email);
            if (await ctx.repo.users.findByEmail(email)) {
              return reply.code(409).send({ error: "email_taken" });
            }
            const trimmed = req.body.displayName?.trim();
            const user = await ctx.repo.users.create({
              email,
              displayName: trimmed && trimmed.length > 0 ? trimmed : (email.split("@")[0] ?? email),
              isAdmin: ctx.config.adminEmails.has(email),
            });
            await ctx.repo.localCredentials.upsert(user.id, await hashPassword(req.body.password));
            await ctx.repo.auditLog.record({
              actorId: user.id,
              action: "auth.register",
              target: user.id,
            });
            await issueSession(ctx, reply, user.id);
            return reply.code(201).send({ user: toPublicUser(user) });
          },
        );
      }

      r.post(
        "/login",
        {
          config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
          schema: {
            body: Credentials,
            response: {
              200: z.object({ user: PublicUser }),
              401: ErrorResponse,
              403: ErrorResponse,
            },
          },
        },
        async (req, reply) => {
          const email = normalizeEmail(req.body.email);
          const user = await ctx.repo.users.findByEmail(email);
          const creds = user ? await ctx.repo.localCredentials.findByUserId(user.id) : null;
          const valid = await verifyPassword(creds?.passwordHash ?? DUMMY_HASH, req.body.password);

          if (!user || !creds || !valid) {
            return reply.code(401).send({ error: "invalid_credentials" });
          }
          if (user.status === "blocked") {
            return reply.code(403).send({ error: "account_blocked" });
          }

          // Stamps last_login_at and self-heals disabled → active.
          const fresh = (await ctx.repo.users.recordLogin(user.id, ctx.clock())) ?? user;
          await ctx.repo.auditLog.record({
            actorId: user.id,
            action: "auth.login",
            target: user.id,
          });
          await issueSession(ctx, reply, user.id);
          return reply.code(200).send({ user: toPublicUser(fresh) });
        },
      );
    },
  };
}
