import { defineConfig } from "drizzle-kit";

// Migration tooling config. `pnpm db:generate` diffs src/db/schema.ts against
// ./drizzle and emits SQL; `pnpm db:migrate` applies it. The URL default
// matches docker-compose.yml so local dev is zero-config.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://arch_vis:arch_vis@localhost:5432/arch_vis",
  },
});
