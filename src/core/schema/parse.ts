// ============================================================================
// Schema parse — the single trust boundary for project documents
// ============================================================================
// Principle 4 from the engineering guide: data crossing into the application
// is validated. Once validated, it's trusted. Every call site that loads a
// project goes through one of these two functions.
// ============================================================================

import { parse as parseYaml } from "yaml";

import { ProjectDocument } from "@/core/schema/schema";

import type { Result } from "@/core/errors/result";
import type { ProjectDocument as ProjectDocumentT } from "@/core/schema/schema";

/** Parse a JSON-shaped value (already deserialized) into a trusted document. */
export function parseProjectJson(raw: unknown): Result<ProjectDocumentT> {
  const parsed = ProjectDocument.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error.issues) };
  }
  return { ok: true, value: parsed.data };
}

/** Parse a YAML string into a trusted document. */
export function parseProjectYaml(yamlText: string): Result<ProjectDocumentT> {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    return {
      ok: false,
      error: `YAML parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return parseProjectJson(raw);
}

// ----------------------------------------------------------------------------
// Internal: format zod issues into a human-readable error string
// ----------------------------------------------------------------------------

function formatZodIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `  • ${path}: ${issue.message}`;
    })
    .join("\n");
}
