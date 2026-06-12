import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure logic — no DOM, no jsdom. Tests read fixture YAML from the repo
    // root (docs/schema-example.yaml, architectures/example-project.yaml).
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
