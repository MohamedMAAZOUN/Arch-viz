// ============================================================================
// exportJson.test.ts — JSON export must round-trip through the parser
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { describe, expect, it } from "vitest";

import { exportBaseName, serializeProject } from "@/core/export/exportJson";
import { parseProjectJson, parseProjectYaml } from "@/core/schema/parse";

const EXAMPLE_PATH = resolvePath(__dirname, "../../../docs/schema-example.yaml");

function loadExample() {
  const result = parseProjectYaml(readFileSync(EXAMPLE_PATH, "utf8"));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("exportJson", () => {
  it("round-trips: serialized JSON re-parses to an equivalent document", () => {
    const doc = loadExample();
    const json = serializeProject(doc);

    const reparsed = parseProjectJson(JSON.parse(json));
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.value).toEqual(doc);
    }
  });

  it("pretty-prints (2-space indent) for human-diffable files", () => {
    const doc = loadExample();
    const json = serializeProject(doc);
    expect(json).toContain('\n  "project"');
  });

  it("derives the base name from the project id", () => {
    const doc = loadExample();
    expect(exportBaseName(doc)).toBe(doc.project.id);
  });
});
