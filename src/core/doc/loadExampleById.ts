// ============================================================================
// loadExampleById — load a bundled example by its registry id
// ============================================================================
// Looks the example up in the registry, lazily fetches its YAML (dynamic
// import → its own chunk), parses through the schema trust boundary, and
// routes it through loadProject. Async because the YAML chunk loads on demand.
// ============================================================================

import { loadProject } from "@/core/doc/loadProject";
import { parseProjectYaml } from "@/core/schema/parse";
import { getExample } from "@/data/examples";

import type { Result } from "@/core/errors";

export async function loadExampleById(id: string): Promise<Result<true>> {
  const example = getExample(id);
  if (example === undefined) {
    return { ok: false, error: `Unknown example: ${id}` };
  }
  let yamlText: string;
  try {
    yamlText = await example.load();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const parsed = parseProjectYaml(yamlText);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  loadProject(parsed.value);
  return { ok: true, value: true };
}
