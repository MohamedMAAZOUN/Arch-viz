// ============================================================================
// Live data — value types
// ============================================================================
// A resolved value for a single data-source binding. Discriminated on the
// schema's `binding` so each render slot (status dot / badge / metric / label)
// gets exactly the fields it needs.
// ============================================================================

export type LiveStatus = "ok" | "warn" | "critical" | "unknown";

export type LiveValue =
  | { binding: "status"; status: LiveStatus; text?: string }
  | { binding: "badge"; text: string }
  | { binding: "metric"; value: number; unit?: string }
  | { binding: "label"; text: string };
