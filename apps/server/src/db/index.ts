// ============================================================================
// Database boundary — the ONLY files that import drizzle-orm / postgres
// ============================================================================
// The server-side analogue of the web app's wrapper rule (engineering guide
// § 1, principle 2): all SQL access flows through this module. Route handlers
// depend on the interfaces exported here, never on the driver. Repository
// functions (users, projects, …) are added next to this file by issue #56+.
// ============================================================================

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/** What the application sees: the typed ORM plus lifecycle/health hooks. */
export interface AppDb {
  readonly orm: PostgresJsDatabase<typeof schema>;
  /** True when `select 1` round-trips. Never throws — health checks degrade. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createDb(databaseUrl: string): AppDb {
  // postgres.js connects lazily — creating the client does not require the
  // database to be up, so the app can boot (and tests can run) without one.
  const sql = postgres(databaseUrl, {
    max: 10,
    connect_timeout: 5,
    // The scaffold has no long-running queries; fail fast instead of hanging.
    idle_timeout: 30,
  });

  return {
    orm: drizzle(sql, { schema }),
    async ping(): Promise<boolean> {
      try {
        await sql`select 1`;
        return true;
      } catch {
        return false;
      }
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
  };
}
