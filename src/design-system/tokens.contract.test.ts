// ============================================================================
// tokens.contract.test.ts — the design-system guardrail
// ============================================================================
// Automated enforcement of the styling rules that were previously convention-
// only (and had already drifted — e.g. a `var(--color-accent-fg)` typo that
// resolved to nothing). This test is the control layer: it runs in `pnpm test`
// / CI, needs no extra tooling, and fails the build when the design system is
// bypassed. The contracts:
//
//   1. Every `var(--token)` referenced in CSS is actually DEFINED (catches typos
//      and deleted tokens — the #1 silent-failure class).
//   2. No raw color literals (`oklch()`, `rgb()`, hex, …) in feature CSS — color
//      must come from tokens. tokens.css is the ONLY place colors are authored.
//   3. Typography (font-size/weight, line-height, letter-spacing), border-radius,
//      animation/transition timing, and z-index in feature CSS use their token
//      family — not raw literals.
//   4. The tokens.ts JS mirror stays in sync with tokens.css for the values that
//      live in both worlds (durations, z-index, breakpoints, MVP palette).
//
// Documented exceptions (intentionally literal): sub-`--space-1` hairline spacing
// (1–3px), border widths, and effect-shadow geometry (glow blur radii).
// ============================================================================

import { readdirSync, readFileSync } from "node:fs";
import { join, posix, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { breakpoint, duration, mvpColors, z } from "@/design-system/tokens";

// Read every CSS file from disk. We use fs rather than `import.meta.glob(...?raw)`
// because the vitest config sets `css: false`, which makes raw CSS imports
// resolve to empty strings — a trap that would make this whole guardrail pass
// vacuously.
const SRC_DIR = join(process.cwd(), "src");

function loadCss(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(SRC_DIR, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".css")) continue;
    // Normalize to a stable, OS-independent "src/…/x.css" key.
    const abs = join(entry.parentPath, entry.name);
    const rel = abs
      .slice(SRC_DIR.length + 1)
      .split(sep)
      .join(posix.sep);
    out[`src/${rel}`] = readFileSync(abs, "utf8");
  }
  return out;
}

const cssFiles = loadCss();

const TOKENS_CSS = "src/design-system/tokens.css";

/** Strip block comments so prose mentioning tokens/colors never trips a check. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Custom-property *declarations* (`--name:`), excluding `var(--name)` refs. */
function definedTokens(css: string): string[] {
  return [...stripComments(css).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1] ?? "");
}

/** Custom-property *references* (`var(--name)`). */
function referencedTokens(css: string): string[] {
  return [...stripComments(css).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] ?? "");
}

// Tokens injected at runtime via inline style (not declared in any CSS file).
const RUNTIME_INJECTED = new Set(["--overlay-tint", "--mvp-color"]);
// Third-party custom-property namespaces we don't own.
const EXTERNAL_PREFIXES = ["--xy-", "--tw-"];

describe("design-system contract", () => {
  it("every var(--token) referenced in CSS is defined somewhere", () => {
    const defined = new Set<string>();
    for (const css of Object.values(cssFiles)) {
      for (const name of definedTokens(css)) defined.add(name);
    }

    const unresolved: { token: string; file: string }[] = [];
    for (const [path, css] of Object.entries(cssFiles)) {
      for (const ref of referencedTokens(css)) {
        if (defined.has(ref) || RUNTIME_INJECTED.has(ref)) continue;
        if (EXTERNAL_PREFIXES.some((p) => ref.startsWith(p))) continue;
        unresolved.push({ token: ref, file: path });
      }
    }

    expect(
      unresolved,
      `Undefined design tokens referenced:\n${JSON.stringify(unresolved, null, 2)}`,
    ).toEqual([]);
  });

  it("no raw color literals outside tokens.css (colors come from tokens)", () => {
    // `oklch(` etc. as a function call. `color-mix(in oklch, …)` is fine — the
    // colorspace keyword has no following paren, so it isn't matched.
    const colorFn = /\b(?:oklch|oklab|rgb|rgba|hsl|hsla|lab|lch|color)\(/;
    const hex = /#[0-9a-fA-F]{3,8}\b/;

    const violations: { file: string; line: string }[] = [];
    for (const [path, css] of Object.entries(cssFiles)) {
      if (path === TOKENS_CSS) continue; // the one place colors are authored
      for (const rawLine of stripComments(css).split("\n")) {
        const line = rawLine.trim();
        if (colorFn.test(line) || hex.test(line)) {
          violations.push({ file: path, line });
        }
      }
    }

    expect(
      violations,
      `Raw colors must be tokens (use var(--color-…)):\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  // Every `property: value` declaration outside tokens.css, except keyframe
  // step selectors. Used by the typography/radius/motion/z-index checks below.
  function declarations(prop: string): { file: string; value: string }[] {
    const re = new RegExp(`\\b${prop}\\s*:\\s*([^;{}]+)`, "g");
    const out: { file: string; value: string }[] = [];
    for (const [path, css] of Object.entries(cssFiles)) {
      if (path === TOKENS_CSS) continue;
      for (const m of stripComments(css).matchAll(re)) {
        out.push({ file: path, value: (m[1] ?? "").trim() });
      }
    }
    return out;
  }

  /** Assert every value of `prop` satisfies `ok` (token-or-allowed). */
  function expectAllTokenized(prop: string, ok: (v: string) => boolean) {
    const bad = declarations(prop).filter((d) => !ok(d.value));
    expect(bad, `${prop} must use a design token:\n${JSON.stringify(bad, null, 2)}`).toEqual([]);
  }

  it("typography uses tokens (font-size / weight / line-height / letter-spacing)", () => {
    // Relative units (em/%) and `inherit` are contextual, not magic literals.
    expectAllTokenized(
      "font-size",
      (v) => v.includes("var(--text") || v === "inherit" || /^[\d.]+(?:em|%)$/.test(v),
    );
    expectAllTokenized("font-weight", (v) => v.includes("var(--weight") || v === "inherit");
    expectAllTokenized(
      "line-height",
      (v) => v.includes("var(--leading") || v === "inherit" || v === "1",
    );
    expectAllTokenized("letter-spacing", (v) => v.includes("var(--tracking") || v === "normal");
  });

  it("border-radius uses tokens (or a full-round literal)", () => {
    expectAllTokenized(
      "border-radius",
      (v) => v.includes("var(--radius") || v.includes("50%") || v.includes("999") || v === "0",
    );
  });

  it("animation/transition timings use duration tokens (no raw ms/s)", () => {
    const hasRawTime = (v: string) => /\d*\.?\d+m?s\b/.test(v.replace(/var\([^)]*\)/g, ""));
    for (const prop of ["transition", "animation", "transition-duration", "animation-duration"]) {
      const bad = declarations(prop).filter((d) => hasRawTime(d.value));
      expect(
        bad,
        `${prop} timings must use var(--duration-…):\n${JSON.stringify(bad, null, 2)}`,
      ).toEqual([]);
    }
  });

  it("z-index uses the token ladder (or a small local stack value)", () => {
    expectAllTokenized(
      "z-index",
      (v) => v.includes("var(--z") || ["-1", "0", "1", "2"].includes(v),
    );
  });
});

// ----------------------------------------------------------------------------
// tokens.ts ↔ tokens.css mirror sync. The first declaration of each token wins
// (the @theme block precedes any media/theme overrides).
// ----------------------------------------------------------------------------

const tokensCss = stripComments(cssFiles[TOKENS_CSS] ?? "");

function firstValue(name: string): string | undefined {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(tokensCss);
  return m?.[1]?.trim();
}

describe("tokens.ts mirrors tokens.css", () => {
  it("durations match (ms)", () => {
    for (const [key, ms] of Object.entries(duration)) {
      expect(firstValue(`--duration-${key}`), `--duration-${key}`).toBe(`${String(ms)}ms`);
    }
  });

  it("z-index ladder matches", () => {
    const map: Record<keyof typeof z, string> = {
      canvas: "canvas",
      canvasControls: "canvas-controls",
      inspector: "inspector",
      topbar: "topbar",
      mvpSlider: "mvp-slider",
      tourOverlay: "tour-overlay",
      dialog: "dialog",
      toast: "toast",
      tooltip: "tooltip",
    };
    for (const [key, cssName] of Object.entries(map)) {
      expect(firstValue(`--z-${cssName}`), `--z-${cssName}`).toBe(String(z[key as keyof typeof z]));
    }
  });

  it("breakpoints match (px)", () => {
    for (const [key, px] of Object.entries(breakpoint)) {
      expect(firstValue(`--breakpoint-${key}`), `--breakpoint-${key}`).toBe(`${String(px)}px`);
    }
  });

  it("MVP palette matches", () => {
    mvpColors.forEach((color, i) => {
      expect(firstValue(`--color-mvp-${String(i + 1)}`), `--color-mvp-${String(i + 1)}`).toBe(
        color,
      );
    });
  });
});
