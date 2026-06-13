// ============================================================================
// @arch-vis/schema — public surface
// ============================================================================
// The single source of truth for the project-document contract, shared by the
// web app and the server (ADR 0014). Everything here is pure TypeScript with
// no React/DOM dependency — enforced by tsconfig (`lib` has no DOM).
//
//   • schema   — the Zod document schema ("schema is law")
//   • parse    — YAML → validated ProjectDocument (the trust boundary)
//   • result   — Result<T, E> + helpers for expected failures
//   • safeUrl  — public-http(s)-only URL guard used by the schema
// ============================================================================

export * from "./schema";
export * from "./parse";
export * from "./result";
export * from "./safeUrl";
