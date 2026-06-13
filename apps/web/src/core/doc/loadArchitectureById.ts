// ============================================================================
// loadArchitectureById — load a bundled architecture by its id
// ============================================================================
// Resolves the id to its lazy loader (auto-discovered from the architectures/
// folder), fetches the YAML, parses it through the schema trust boundary, and
// routes it through loadProject. Async because the YAML chunk loads on demand.
// ============================================================================

import { parseProjectYaml } from "@arch-vis/schema";

import { loadProject } from "@/core/doc/loadProject";
import { getArchitectureLoader } from "@/data/architectures";

import type { Result } from "@/core/errors";

export async function loadArchitectureById(id: string): Promise<Result<true>> {
  const load = getArchitectureLoader(id);
  if (load === undefined) {
    return { ok: false, error: `Unknown architecture: ${id}` };
  }
  let yamlText: string;
  try {
    yamlText = await load();
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
