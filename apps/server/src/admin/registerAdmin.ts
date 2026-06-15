// ============================================================================
// Admin surface — user lifecycle + audit (#59)
// ============================================================================
// The status lifecycle (ADR 0014) the login flows already half-implement gains
// its admin half here:
//   • disable — offboarding; the next successful auth self-heals it to active.
//   • block   — hard stop; successful auth does NOT unblock, and the user's live
//               sessions are revoked immediately (the guard already rejects a
//               non-active user on the very next request, so blocking is instant).
//   • unblock — admin-only return to active.
// Every mutation writes an `audit_log` row (actor, action, target). The scope is
// gated by an admin guard: a non-admin authenticated user gets 403, anonymous
// gets 401.
// ============================================================================

import { z } from "zod";

import { createSessionGuard } from "../auth/guard";
import { PublicUser, toPublicUser } from "../auth/publicUser";
import { addOriginGuard } from "../http/csrf";

import type { AuthContext } from "../auth/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

const ErrorResponse = z.object({ error: z.string() });
const Params = z.object({ id: z.string() });
const UserResponse = z.object({ user: PublicUser });

export async function registerAdmin(app: FastifyInstance, ctx: AuthContext): Promise<void> {
  const requireUser = createSessionGuard(ctx);

  async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!req.authUser?.isAdmin) await reply.code(403).send({ error: "forbidden" });
  }

  await app.register(
    (scope, _opts, done) => {
      addOriginGuard(scope, ctx.config.security.allowedOrigins);
      // requireUser decorates req.authUser (401 if anonymous); requireAdmin then
      // 403s a non-admin. preHandlers run in order and short-circuit on send.
      scope.addHook("preHandler", requireUser);
      scope.addHook("preHandler", requireAdmin);

      const r = scope.withTypeProvider<ZodTypeProvider>();

      r.get(
        "/users",
        { schema: { response: { 200: z.object({ users: z.array(PublicUser) }) } } },
        async () => {
          const rows = await ctx.repo.users.list();
          return { users: rows.map(toPublicUser) };
        },
      );

      /** Apply a status transition to a target user, audit it, return the row. */
      const transition = async (
        actor: NonNullable<FastifyRequest["authUser"]>,
        targetId: string,
        reply: FastifyReply,
        action: "disable" | "block" | "unblock",
      ) => {
        if ((action === "disable" || action === "block") && targetId === actor.id) {
          return reply.code(400).send({ error: "cannot_modify_self" });
        }

        const target = await ctx.repo.users.findById(targetId);
        if (!target) return reply.code(404).send({ error: "not_found" });

        const status =
          action === "unblock" ? "active" : action === "disable" ? "disabled" : "blocked";
        await ctx.repo.users.setStatus(targetId, status);

        // Blocking is immediate: drop every live session so the next request 401s.
        if (action === "block") await ctx.sessions.revokeAllForUser(targetId);

        await ctx.repo.auditLog.record({
          actorId: actor.id,
          action: `admin.user.${action}`,
          target: targetId,
        });

        const fresh = await ctx.repo.users.findById(targetId);
        return reply.code(200).send({ user: toPublicUser(fresh ?? { ...target, status }) });
      };

      const mutationSchema = {
        params: Params,
        response: {
          200: UserResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      };

      // requireAdmin guarantees an admin actor, but narrow explicitly rather
      // than assert so the handler stays sound if the guard order ever changes.
      r.post("/users/:id/disable", { schema: mutationSchema }, async (req, reply) => {
        const actor = req.authUser;
        if (!actor) return reply.code(401).send({ error: "unauthorized" });
        await transition(actor, req.params.id, reply, "disable");
      });
      r.post("/users/:id/block", { schema: mutationSchema }, async (req, reply) => {
        const actor = req.authUser;
        if (!actor) return reply.code(401).send({ error: "unauthorized" });
        await transition(actor, req.params.id, reply, "block");
      });
      r.post("/users/:id/unblock", { schema: mutationSchema }, async (req, reply) => {
        const actor = req.authUser;
        if (!actor) return reply.code(401).send({ error: "unauthorized" });
        await transition(actor, req.params.id, reply, "unblock");
      });

      done();
    },
    { prefix: "/admin" },
  );
}
