// ============================================================================
// Append-only snapshot history (#62)
// ============================================================================
// "Commit" is an append, never an overwrite: each commit validates the document
// with the shared Zod parser, takes the next version number, and records the
// author. There is no UPDATE or DELETE on snapshots anywhere in the stack — the
// repository exposes only `append` and reads, and the `(project_id, version)`
// unique constraint turns a racing double-append into a hard 409. "Restore" is a
// client concern: load version N and commit it as the new head.
// ============================================================================

import { parseProjectJson } from "@arch-vis/schema";
import { z } from "zod";

import { authorizeProject } from "./access";
import { ErrorResponse, SnapshotMetaSchema, toSnapshotMeta } from "./serialize";

import type { AuthContext } from "../auth/types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

const CommitBody = z.object({ document: z.unknown() });

const SnapshotDetail = SnapshotMetaSchema.extend({ document: z.unknown() });

export function registerSnapshotRoutes(scope: FastifyInstance, ctx: AuthContext): void {
  const r = scope.withTypeProvider<ZodTypeProvider>();

  // Commit a new version — editor or owner.
  r.post(
    "/:id/snapshots",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        params: z.object({ id: z.string() }),
        body: CommitBody,
        response: {
          201: SnapshotMetaSchema,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
          422: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const access = await authorizeProject(ctx, req, reply, req.params.id, "edit");
      if (!access) return;

      const parsed = parseProjectJson(req.body.document);
      if (!parsed.ok) return reply.code(422).send({ error: "invalid_document" });

      const latest = await ctx.repo.snapshots.latest(access.project.id);
      const version = (latest?.version ?? 0) + 1;

      let row;
      try {
        row = await ctx.repo.snapshots.append({
          projectId: access.project.id,
          version,
          document: parsed.value,
          createdBy: access.user?.id ?? null,
        });
      } catch {
        // Unique (project_id, version) violation: someone committed concurrently.
        return reply.code(409).send({ error: "version_conflict" });
      }
      return reply.code(201).send(toSnapshotMeta(row));
    },
  );

  // Version list — any viewer.
  r.get(
    "/:id/snapshots",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({ snapshots: z.array(SnapshotMetaSchema) }),
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const access = await authorizeProject(ctx, req, reply, req.params.id, "view");
      if (!access) return;
      const rows = await ctx.repo.snapshots.list(access.project.id);
      return reply.code(200).send({ snapshots: rows.map(toSnapshotMeta) });
    },
  );

  // Fetch one version (with its document) — any viewer.
  r.get(
    "/:id/snapshots/:version",
    {
      schema: {
        params: z.object({ id: z.string(), version: z.coerce.number().int().positive() }),
        response: { 200: SnapshotDetail, 401: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const access = await authorizeProject(ctx, req, reply, req.params.id, "view");
      if (!access) return;
      const row = await ctx.repo.snapshots.getByVersion(access.project.id, req.params.version);
      if (!row) return reply.code(404).send({ error: "not_found" });
      return reply.code(200).send({ ...toSnapshotMeta(row), document: row.document });
    },
  );
}
