// ============================================================================
// architectures — auto-discovered catalog of bundled architectures
// ============================================================================
// The single source of truth for "which architectures ship with the app". It
// is NOT a hand-maintained list: every `*.yaml` in the repo-root `architectures/`
// folder is discovered at build time via Vite's `import.meta.glob`. Drop a file
// in that folder and it shows up in the picker (⌘K) and in Settings — no code
// change required.
//
// Two views over the same files:
//   • loaders   — id → lazy `() => Promise<string>` (raw YAML, own chunk).
//   • index     — id → { name, description, elementCount, nodeNames } used to
//                 render and SEARCH the list (search matches architecture name
//                 AND the names of the nodes inside). Built once, on first
//                 access, then cached.
//
// The index uses a light YAML parse (no Zod) — it only needs display/search
// metadata and must be forgiving of a slightly-off file. The actual load of a
// selected architecture still goes through the schema trust boundary
// (parseProjectYaml) in loadArchitectureById.
// ============================================================================

import { parse as parseYaml } from "yaml";

// Eagerly map the folder to lazy raw-text loaders. The glob is build-time; the
// YAML bodies themselves are still fetched on demand (each is its own chunk).
const RAW_LOADERS = import.meta.glob("/architectures/*.yaml", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

export interface ArchitectureEntry {
  /** Stable id derived from the filename (without extension). */
  id: string;
  /** Display name (project.name, falling back to the id). */
  name: string;
  /** Optional one-line description (project.description). */
  description?: string;
  /** Number of elements ("nodes"), for display. */
  elementCount: number;
  /** Names of every node inside — the searchable surface beyond the title. */
  nodeNames: string[];
  /** Lazily fetch the raw YAML for this architecture. */
  load: () => Promise<string>;
}

/** Filename → id: "/architectures/aurora-platform.yaml" → "aurora-platform". */
function idFromPath(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.replace(/\.ya?ml$/i, "");
}

/** The default architecture seeded on a fresh start. */
export const DEFAULT_ARCHITECTURE_ID = "example-project";

/** Lazy loader for a single architecture's raw YAML, or undefined if unknown. */
export function getArchitectureLoader(id: string): (() => Promise<string>) | undefined {
  const path = Object.keys(RAW_LOADERS).find((p) => idFromPath(p) === id);
  return path === undefined ? undefined : RAW_LOADERS[path];
}

// ----------------------------------------------------------------------------
// Index — built once, cached. Parses every file to extract name + node names.
// ----------------------------------------------------------------------------

let indexPromise: Promise<ArchitectureEntry[]> | undefined;

/** Shape we read out of a light YAML parse — everything is best-effort. */
interface RawArchitecture {
  project?: { name?: unknown; description?: unknown };
  elements?: unknown[];
}

function buildEntry(
  path: string,
  load: () => Promise<string>,
  yamlText: string,
): ArchitectureEntry {
  const id = idFromPath(path);
  let raw: RawArchitecture = {};
  try {
    raw = (parseYaml(yamlText) ?? {}) as RawArchitecture;
  } catch {
    // A malformed file still appears in the list (named after its file) so the
    // user can see and pick it; the real parse error surfaces on load.
  }
  const name = typeof raw.project?.name === "string" ? raw.project.name : id;
  const description =
    typeof raw.project?.description === "string" ? raw.project.description : undefined;
  const elements = Array.isArray(raw.elements) ? raw.elements : [];
  const nodeNames = elements
    .map((el) => {
      const elName = (el as { name?: unknown } | null)?.name;
      return typeof elName === "string" ? elName : null;
    })
    .filter((n): n is string => n !== null);
  return {
    id,
    name,
    elementCount: elements.length,
    nodeNames,
    load,
    // Omit (rather than set undefined) to satisfy exactOptionalPropertyTypes.
    ...(description !== undefined ? { description } : {}),
  };
}

/**
 * The searchable catalog. Loads + parses every architecture once, then caches
 * the result. Subsequent calls return the same promise. Entries are sorted by
 * display name.
 */
export function getArchitectureIndex(): Promise<ArchitectureEntry[]> {
  if (indexPromise === undefined) {
    indexPromise = Promise.all(
      Object.entries(RAW_LOADERS).map(async ([path, load]) => {
        const yamlText = await load();
        return buildEntry(path, load, yamlText);
      }),
    ).then((entries) => entries.sort((a, b) => a.name.localeCompare(b.name)));
  }
  return indexPromise;
}
