// ============================================================================
// mapValue — coerce a raw fetched value into a typed LiveValue
// ============================================================================
// Pure. APIs return strings/numbers/objects; we map them onto the binding the
// schema declared. Returns null when the raw value can't satisfy the binding
// (e.g. a non-numeric "metric"), which the caller turns into an error state.
// ============================================================================

import type { LiveStatus, LiveValue } from "@/core/live/types";
import type { DataBinding } from "@arch-vis/schema";

/** Map common health vocabularies onto our four-state status. */
export function coerceStatus(raw: unknown): LiveStatus {
  if (typeof raw === "number") return raw > 0 ? "ok" : "critical";
  if (typeof raw === "boolean") return raw ? "ok" : "critical";
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (["ok", "up", "healthy", "green", "pass", "success", "1", "true"].includes(v)) return "ok";
    if (["warn", "warning", "degraded", "amber", "yellow", "pending"].includes(v)) return "warn";
    if (["critical", "down", "error", "red", "fail", "failed", "0", "false"].includes(v)) {
      return "critical";
    }
  }
  return "unknown";
}

export function toLiveValue(binding: DataBinding, raw: unknown): LiveValue | null {
  switch (binding) {
    case "status": {
      const text = textOf(raw);
      return { binding: "status", status: coerceStatus(raw), ...(text !== null ? { text } : {}) };
    }
    case "badge": {
      const text = textOf(raw);
      return text !== null ? { binding: "badge", text } : null;
    }
    case "metric": {
      const value = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(value) ? { binding: "metric", value } : null;
    }
    case "label": {
      const text = textOf(raw);
      return text !== null ? { binding: "label", text } : null;
    }
  }
}

function textOf(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  return null;
}
