// ============================================================================
// Sharing — viewer/editor membership (#61)
// ============================================================================
// Minimal viable authorization: an owner invites accounts as `viewer` or
// `editor`. Member management (invite / change role / remove) is owner-only
// (`manage`); listing members needs only `view`. Orgs, teams, and link-sharing
// stay deferred.
//
// v1 invite policy: invite-by-email requires an existing account. There is no
// pending-invite table yet, so an email with no account is rejected with a clear
// error rather than silently swallowed (the issue's documented fallback).
// ============================================================================

import { z } from "zod";

import { authorizeProject } from "./access";
import { ErrorResponse, MemberSchema, toPublicMember } from "./serialize";

import type { AuthContext } from "../auth/types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

const RoleSchema = z.enum(["viewer", "editor"]);
const InviteBody = z.object({ email: z.email().max(254), role: RoleSchema });
const ChangeRoleBody = z.object({ role: RoleSchema });

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export function registerMemberRoutes(scope: FastifyInstance, ctx: AuthContext): void {
  const r = scope.withTypeProvider<ZodTypeProvider>();

  // List members — any viewer.
  r.get(
    "/:id/members",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({ members: z.array(MemberSchema) }),
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const access = await authorizeProject(ctx, req, reply, req.params.id, "view");
      if (!access) return;

      const rows = await ctx.repo.projectMembers.listForProject(access.project.id);
      const members = [];
      for (const row of rows) {
        const user = await ctx.repo.users.findById(row.userId);
        if (user) members.push(toPublicMember(row, user));
      }
      return reply.code(200).send({ members });
    },
  );

  // Invite by email — owner only.
  r.post(
    "/:id/members",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        params: z.object({ id: z.string() }),
        body: InviteBody,
        response: {
          201: MemberSchema,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const access = await authorizeProject(ctx, req, reply, req.params.id, "manage");
      if (!access) return;

      const email = normalizeEmail(req.body.email);
      const invitee = await ctx.repo.users.findByEmail(email);
      if (!invitee) return reply.code(404).send({ error: "no_account_for_email" });
      if (invitee.id === access.project.ownerId) {
        return reply.code(409).send({ error: "owner_cannot_be_member" });
      }
      if (await ctx.repo.projectMembers.find(access.project.id, invitee.id)) {
        return reply.code(409).send({ error: "already_member" });
      }

      const member = await ctx.repo.projectMembers.add({
        projectId: access.project.id,
        userId: invitee.id,
        role: req.body.role,
      });
      return reply.code(201).send(toPublicMember(member, invitee));
    },
  );

  // Change a member's role — owner only.
  r.patch(
    "/:id/members/:userId",
    {
      schema: {
        params: z.object({ id: z.string(), userId: z.string() }),
        body: ChangeRoleBody,
        response: {
          200: MemberSchema,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const access = await authorizeProject(ctx, req, reply, req.params.id, "manage");
      if (!access) return;

      const updated = await ctx.repo.projectMembers.updateRole(
        access.project.id,
        req.params.userId,
        req.body.role,
      );
      if (!updated) return reply.code(404).send({ error: "not_found" });
      const user = await ctx.repo.users.findById(updated.userId);
      if (!user) return reply.code(404).send({ error: "not_found" });
      return reply.code(200).send(toPublicMember(updated, user));
    },
  );

  // Remove a member — owner only.
  r.delete(
    "/:id/members/:userId",
    {
      schema: {
        params: z.object({ id: z.string(), userId: z.string() }),
        response: { 204: z.null(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const access = await authorizeProject(ctx, req, reply, req.params.id, "manage");
      if (!access) return;
      await ctx.repo.projectMembers.remove(access.project.id, req.params.userId);
      return reply.code(204).send(null);
    },
  );
}
