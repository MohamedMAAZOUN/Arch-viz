// ============================================================================
// contrast.test — the WCAG math, and an audit of new token combinations (#30)
// ============================================================================
// The token VALUES below mirror tokens.css. They're duplicated here on purpose:
// this test is the contract that the badge / type-bar / tone token pairings
// meet WCAG AA in every theme × brand. If a token changes, update it here and
// the test re-verifies the contrast — the audit stays automated rather than a
// one-off devtools eyeball.
// ============================================================================

import { describe, expect, it } from "vitest";

import { contrastRatio, parseOklch } from "@/design-system/contrast";

/** WCAG AA for normal text. */
const AA_TEXT = 4.5;
/** WCAG AA for large text / graphical UI components (1.4.11). */
const AA_UI = 3;

// The node body surface that badges, the type bar, and inspector tone text sit
// on (--color-bg-2), per theme.
const SURFACE = {
  dark: "oklch(22% 0.026 250)",
  light: "oklch(95% 0.008 250)",
} as const;

// --color-mvp-1..8 (lifecycle badge text/dot, overlay tint).
const MVP = {
  dark: [
    "oklch(72% 0.17 250)",
    "oklch(76% 0.16 70)",
    "oklch(72% 0.19 145)",
    "oklch(70% 0.21 350)",
    "oklch(76% 0.17 195)",
    "oklch(70% 0.21 30)",
    "oklch(74% 0.18 115)",
    "oklch(70% 0.18 295)",
  ],
  light: [
    "oklch(50% 0.18 250)",
    "oklch(52% 0.16 70)",
    "oklch(50% 0.17 145)",
    "oklch(50% 0.21 350)",
    "oklch(48% 0.14 195)",
    "oklch(52% 0.21 30)",
    "oklch(52% 0.16 115)",
    "oklch(50% 0.2 295)",
  ],
} as const;

// --color-type-* (node left type bar).
const TYPE = {
  dark: [
    "oklch(70% 0.15 250)",
    "oklch(68% 0.16 150)",
    "oklch(75% 0.14 70)",
    "oklch(72% 0.14 200)",
    "oklch(68% 0.17 300)",
    "oklch(71% 0.16 30)",
    "oklch(60% 0.03 250)",
  ],
  light: [
    "oklch(50% 0.16 250)",
    "oklch(50% 0.14 150)",
    "oklch(52% 0.13 70)",
    "oklch(50% 0.13 200)",
    "oklch(50% 0.18 300)",
    "oklch(52% 0.18 30)",
    "oklch(45% 0.03 250)",
  ],
} as const;

// --color-tone-* values used as TEXT (inspector diagnostics / validation).
const TONE_TEXT = {
  dark: {
    critical: "oklch(70% 0.21 22)",
    warning: "oklch(82% 0.17 78)",
    success: "oklch(76% 0.18 148)",
  },
  light: {
    critical: "oklch(56% 0.22 22)",
    warning: "oklch(52% 0.18 78)",
    success: "oklch(50% 0.18 148)",
  },
  // Michelin brand re-tints warning; only the light value is at risk.
  michelinLight: "oklch(52% 0.2 50)",
} as const;

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("oklch(0% 0 0)", "oklch(100% 0 0)")).toBeCloseTo(21, 0);
  });

  it("returns 1 for a color on itself", () => {
    expect(contrastRatio("oklch(50% 0.1 250)", "oklch(50% 0.1 250)")).toBeCloseTo(1, 5);
  });

  it("is symmetric in its arguments", () => {
    const a = contrastRatio("oklch(30% 0.05 250)", "oklch(90% 0.02 250)");
    const b = contrastRatio("oklch(90% 0.02 250)", "oklch(30% 0.05 250)");
    expect(a).toBeCloseTo(b, 6);
  });

  it("composites a translucent foreground over the background", () => {
    // A 15%-alpha accent reads as a faint wash of the surface — markedly lower
    // contrast than the same accent at full opacity.
    const translucent = contrastRatio("oklch(75% 0.18 220 / 0.15)", SURFACE.dark);
    const opaque = contrastRatio("oklch(75% 0.18 220)", SURFACE.dark);
    expect(translucent).toBeGreaterThan(1);
    expect(translucent).toBeLessThan(opaque);
  });
});

describe("parseOklch", () => {
  it("parses lightness percentages and an optional alpha", () => {
    expect(parseOklch("oklch(72% 0.17 250)")).toEqual({ l: 0.72, c: 0.17, h: 250, alpha: 1 });
    expect(parseOklch("oklch(75% 0.18 220 / 0.15)")).toEqual({
      l: 0.75,
      c: 0.18,
      h: 220,
      alpha: 0.15,
    });
  });
});

describe("contrast audit — new token combinations (#30)", () => {
  for (const theme of ["dark", "light"] as const) {
    it(`MVP palette badge color clears AA text on the ${theme} node surface`, () => {
      for (const color of MVP[theme]) {
        expect(contrastRatio(color, SURFACE[theme])).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });

    it(`type bar clears the AA graphical threshold on the ${theme} node surface`, () => {
      for (const color of TYPE[theme]) {
        expect(contrastRatio(color, SURFACE[theme])).toBeGreaterThanOrEqual(AA_UI);
      }
    });

    it(`tone text (critical/warning/success) clears AA text on the ${theme} surface`, () => {
      for (const color of Object.values(TONE_TEXT[theme])) {
        expect(contrastRatio(color, SURFACE[theme])).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  }

  it("Michelin light warning tone clears AA text", () => {
    expect(contrastRatio(TONE_TEXT.michelinLight, SURFACE.light)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
