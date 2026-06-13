// ============================================================================
// Result — discriminated-union return type for fallible operations
// ============================================================================
// Section 10 of the engineering guide: expected failures return Result;
// programming bugs throw. This type is the contract for "expected failure."
// ============================================================================

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Unwrap a Result, throwing if it failed. Use ONLY when failure is a bug. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`unwrap on failed Result: ${String(result.error)}`);
  }
  return result.value;
}
