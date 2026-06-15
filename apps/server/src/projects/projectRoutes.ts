// ============================================================================
// Projects CRUD (#60)
// ============================================================================
// The catalog as a live API. Reads are guest-friendly (public projects only
// without a cookie; own + shared once authenticated); writes are owner/editor
// scoped through `authorizeProject`. Every document crossing the boundary is
// validated by the shared `@arch-vis/schema` parser — the same code path the
// YAML loader uses — so a project round-trips through the real parser, not a
// bespoke server copy.
// ============================================================================

import { parseProjectJson } from "@arch-vis/schema";
import { z } from "zod";

import { authorizeProject } from "./access";
import { ErrorResponse, ProjectSchema, toPublicProject } from "./serialize";
import { resolveSessionUser } from "../auth/guard";

import type { AuthContext } from "../auth/types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

const CreateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  // Optional seed document. When present it is committed as version 1; when
  // absent the project starts empty and the first commit becomes version 1.
  document: z.unknown().optional(),
});

const RenameBody = z.object({ name: z.string().min(1).max(200) });

const ProjectDetail = z.object({
  project: ProjectSchema,
  document: z.unknown(),
  version: z.number().int().nullable(),
  role: z.enum(["owner", "editor", "viewer"]),
});

export function registerProjectCrud(scope: FastifyInstance, ctx: AuthContext): void {
  const r = scope.withTypeProvider<ZodTypeProvider>();

  // List — guests see public projects; authenticated users see own + shared.
  r.get(
    "/",
    { schema: { response: { 200: z.object({ projects: z.array(ProjectSchema) }) } } },
    async (req, reply) => {
      const user = await resolveSessionUser(ctx, req, reply);
      const rows = user
        ? await ctx.repo.projects.listForUser(user.id)
        : await ctx.repo.projects.listPublic();
      return reply.code(200).send({ projects: rows.map(toPublicProject) });
    },
  );

  // Create — authenticated; the body document is parsed by the shared schema.
  r.post(
    "/",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        body: CreateBody,
        response: { 201: ProjectDetail, 401: ErrorResponse, 422: ErrorResponse },
      },
    },
    async (req, reply) => {
      const user = await resolveSessionUser(ctx, req, reply);
      if (!user) return reply.code(401).send({ error: "unauthorized" });

      let document = null;
      if (req.body.document !== undefined) {
        const parsed = parseProjectJson(req.body.document);
        if (!parsed.ok) return reply.code(422).send({ error: "invalid_document" });
        document = parsed.value;
      }

      const trimmed = req.body.name?.trim();
      const name = trimmed && trimmed.length > 0 ? trimmed : document?.project.name;
      if (!name) return reply.code(422).send({ error: "name_required" });

      const project = await ctx.repo.projects.create({ name, ownerId: user.id });
      if (document) {
        await ctx.repo.snapshots.append({
          projectId: project.id,
          version: 1,
          document,
          createdBy: user.id,
        });
      }

      return reply.code(201).send({
        project: toPublicProject(project),
        document,
        version: document ? 1 : null,
        role: "owner",
      });
    },
  );

  // Read — returns metadata plus the latest committed document.
  r.get(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: ProjectDetail, 401: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const access = await authorizeProject(ctx, req, reply, req.params.id, "view");
      if (!access) return;

      const latest = await ctx.repo.snapshots.latest(access.project.id);
      return reply.code(200).send({
        project: toPublicProject(access.project),
        document: latest?.document ?? null,
        version: latest?.version ?? null,
        role: access.role,
      });
    },
  );

  // Rename — editor or owner.
  r.patch(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: RenameBody,
        response: {
          200: z.object({ project: ProjectSchema }),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const access = await authorizeProject(ctx, req, reply, req.params.id, "edit");
      if (!access) return;

      const updated = await ctx.repo.projects.rename(access.project.id, req.body.name.trim());
      if (!updated) return reply.code(404).send({ error: "not_found" });
      return reply.code(200).send({ project: toPublicProject(updated) });
    },
  );

  // Delete — owner only.
  r.delete(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 204: z.null(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const access = await authorizeProject(ctx, req, reply, req.params.id, "delete");
      if (!access) return;
      await ctx.repo.projects.delete(access.project.id);
      return reply.code(204).send(null);
    },
  );
}
