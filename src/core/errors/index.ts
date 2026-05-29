// Public surface of the core/errors module.
export type { Result } from "@/core/errors/result";
export { ok, err, unwrap } from "@/core/errors/result";

/** Compile-time exhaustiveness guard for discriminated-union switches.
 *  Throws at runtime if an unhandled variant slips through. */
export function assertNever(x: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
}
