// ============================================================================
// Sync mount — Hocuspocus on the same Node/Fastify process (ADR 0014, #65)
// ============================================================================
// Hocuspocus shares the Fastify HTTP server: @fastify/websocket handles the
// upgrade and hands each socket to `handleConnection`. The document name (the
// project id — one room per project) travels in the Yjs protocol messages, so a
// single `/sync` endpoint is enough. The instance is destroyed on app close.
// ============================================================================

import websocket from "@fastify/websocket";

import { createSyncServer } from "./hocuspocus";

import type { AuthContext } from "../auth/types";
import type { FastifyInstance } from "fastify";

export async function registerSync(app: FastifyInstance, ctx: AuthContext): Promise<void> {
  const sync = createSyncServer({ repo: ctx.repo, config: ctx.config, clock: ctx.clock });

  await app.register(websocket);

  app.get("/sync", { websocket: true }, (socket, request) => {
    sync.handleConnection(socket, request.raw);
  });

  app.addHook("onClose", async () => {
    await sync.destroy();
  });
}
