// ============================================================================
// schema.test.ts — proves the schema + example YAML stay in sync
// ============================================================================
// Schema is the contract. We never mock it in tests; we exercise the real
// Zod parser against the real example document.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { err, ok } from "@/core/errors";
import { parseProjectYaml } from "@/core/schema/parse";

const EXAMPLE_PATH = resolve(__dirname, "../../../docs/schema-example.yaml");
const BUNDLED_EXAMPLE_PATH = resolve(__dirname, "../../data/example-project.yaml");

describe("schema", () => {
  it("validates the example YAML", () => {
    const text = readFileSync(EXAMPLE_PATH, "utf8");
    const result = parseProjectYaml(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.project.name).toBe("Shopfront Platform");
      expect(result.value.mvps.length).toBeGreaterThanOrEqual(1);
      expect(result.value.elements.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("validates the bundled example project (incl. documentation + annotations)", () => {
    const text = readFileSync(BUNDLED_EXAMPLE_PATH, "utf8");
    const result = parseProjectYaml(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const documented = result.value.elements.find((e) => e.documentation !== undefined);
      expect(documented?.documentation).toContain("Catalog Service");
      const annotated = result.value.elements.find(
        (e) => e.annotations !== undefined && e.annotations.length > 0,
      );
      expect(annotated?.annotations?.[0]?.body).toBeTruthy();
    }
  });

  it("rejects a doc with an unknown parent reference", () => {
    const broken = `
$schemaVersion: "1.0.0"
project:
  id: x
  name: X
  theme: default
mvps:
  - { id: mvp1, name: L, order: 1, color: "#000000" }
layers:
  - { id: business, order: 1, label: B }
  - { id: architecture, order: 2, label: A }
  - { id: engineering, order: 3, label: E }
elements:
  - id: a
    type: service
    name: A
    parent: ghost
    minLayer: business
    properties: {}
    lifecycle:
      introducedIn: mvp1
connections: []
`;
    const result = parseProjectYaml(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unknown parent ghost");
    }
  });

  it("accepts elements with documentation and annotations", () => {
    const doc = `
$schemaVersion: "1.0.0"
project:
  id: x
  name: X
  theme: default
mvps:
  - { id: mvp1, name: L, order: 1, color: "#000000" }
layers:
  - { id: business, order: 1, label: B }
  - { id: architecture, order: 2, label: A }
  - { id: engineering, order: 3, label: E }
elements:
  - id: a
    type: service
    name: A
    minLayer: business
    properties: {}
    documentation: "## Notes\\n\\nSome **markdown** docs."
    annotations:
      - { id: note-1, body: "First note", author: "ada", createdAt: "2026-01-01T00:00:00Z" }
    lifecycle:
      introducedIn: mvp1
connections: []
`;
    const result = parseProjectYaml(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const el = result.value.elements[0];
      expect(el?.documentation).toContain("markdown");
      expect(el?.annotations?.[0]?.body).toBe("First note");
    }
  });

  it("rejects an annotation with an empty body", () => {
    const doc = `
$schemaVersion: "1.0.0"
project:
  id: x
  name: X
  theme: default
mvps:
  - { id: mvp1, name: L, order: 1, color: "#000000" }
layers:
  - { id: business, order: 1, label: B }
  - { id: architecture, order: 2, label: A }
  - { id: engineering, order: 3, label: E }
elements:
  - id: a
    type: service
    name: A
    minLayer: business
    properties: {}
    annotations:
      - { id: note-1, body: "", createdAt: "2026-01-01T00:00:00Z" }
    lifecycle:
      introducedIn: mvp1
connections: []
`;
    const result = parseProjectYaml(doc);
    expect(result.ok).toBe(false);
  });

  it("Result helpers preserve discriminated union", () => {
    const a = ok(42);
    const b = err("nope");
    expect(a).toEqual({ ok: true, value: 42 });
    expect(b).toEqual({ ok: false, error: "nope" });
  });
});
