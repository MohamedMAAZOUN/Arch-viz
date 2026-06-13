// ============================================================================
// jsonPath — minimal dotted/indexed path extraction for HTTP responses
// ============================================================================
// Pure. Supports the common shapes a metrics/issue API returns, e.g.
// "data.result[0].value" or "issues[0].fields.status.name". Not a full
// JSONPath implementation — just dot segments and [n] array indices.
// Returns undefined for any miss (never throws).
// ============================================================================

export function extractPath(root: unknown, path: string): unknown {
  // Split "a.b[0].c" → ["a","b","0","c"]
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((s) => s.length > 0);

  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}
