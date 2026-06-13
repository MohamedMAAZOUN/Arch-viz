import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // HTTP tests use app.inject() with a stubbed DB — no sockets, no Postgres.
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    env: {
      NODE_ENV: "test",
    },
  },
});
