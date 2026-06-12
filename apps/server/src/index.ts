// ============================================================================
// @arch-vis/server — boot sequence
// ============================================================================
// 1. Validate the environment (fail fast, non-zero exit, readable Zod error).
// 2. Create the DB handle (lazy — Postgres need not be up yet).
// 3. Build the Fastify app and listen.
// Shutdown closes the HTTP server before the DB pool.
// ============================================================================

import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";

const config = loadConfig(process.env);
if (!config.ok) {
  console.error(config.error);
  process.exit(1);
}

const db = createDb(config.value.databaseUrl);
const app = await buildApp(config.value, db);

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void app
      .close()
      .then(() => db.close())
      .then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: config.value.host, port: config.value.port });
} catch (error) {
  app.log.error(error);
  await db.close();
  process.exit(1);
}
