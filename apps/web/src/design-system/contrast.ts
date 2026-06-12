// ============================================================================
// contrast — WCAG contrast math for OKLCH design tokens
// ============================================================================
// Pure, dependency-free. Parses the `oklch(...)` strings the tokens are written
// in, converts to linear sRGB (Björn Ottosson's OKLab matrices), and computes
// relative luminance + WCAG 2.x contrast ratios. Supports alpha by compositing
// a translucent colour over an opaque background first.
//
// Used by the contrast audit test (issue #30) to verify new token combinations
// meet WCAG AA in every theme × brand, so the check is automated rather than a
// one-off devtools eyeball.
// ============================================================================

export interface Oklch {
  /** Lightness, 0–1. */
  l: number;
  /** Chroma, ≥0. */
  c: number;
  /** Hue, degrees. */
  h: number;
  /** Alpha, 0–1. */
  alpha: number;
}

/** Parse `oklch(72% 0.17 250)` / `oklch(72% 0.17 250 / 0.15)`. Lightness may be
 *  a percentage or a 0–1 number; alpha may be a percentage or 0–1. */
export function parseOklch(input: string): Oklch {
  const match = /^oklch\(\s*([^)]+)\)$/i.exec(input.trim());
  if (match === null) throw new Error(`Not an oklch() color: ${input}`);
  const body = match[1] ?? "";
  const [coords, alphaRaw] = body.split("/").map((s) => s.trim());
  const parts = (coords ?? "").split(/\s+/).filter((s) => s.length > 0);
  const lRaw = parts[0];
  const cRaw = parts[1];
  const hRaw = parts[2];
  if (lRaw === undefined || cRaw === undefined || hRaw === undefined) {
    throw new Error(`Malformed oklch() color: ${input}`);
  }
  const l = lRaw.endsWith("%") ? Number.parseFloat(lRaw) / 100 : Number.parseFloat(lRaw);
  const c = Number.parseFloat(cRaw);
  const h = Number.parseFloat(hRaw);
  const alpha =
    alphaRaw === undefined
      ? 1
      : alphaRaw.endsWith("%")
        ? Number.parseFloat(alphaRaw) / 100
        : Number.parseFloat(alphaRaw);
  return { l, c, h, alpha };
}

interface LinearRgb {
  r: number;
  g: number;
  b: number;
}

/** OKLCH → linear sRGB (clamped to the [0,1] gamut). */
function oklchToLinearRgb({ l, c, h }: Oklch): LinearRgb {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lc = l_ * l_ * l_;
  const mc = m_ * m_ * m_;
  const sc = s_ * s_ * s_;

  const r = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bl = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc;

  return { r: clamp01(r), g: clamp01(g), b: clamp01(bl) };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Composite a (possibly translucent) colour over an opaque background, in
 *  linear-light. Returns the resulting opaque linear RGB. */
function compositeOver(fg: Oklch, bg: Oklch): LinearRgb {
  const f = oklchToLinearRgb(fg);
  const b = oklchToLinearRgb(bg);
  const a = clamp01(fg.alpha);
  return {
    r: f.r * a + b.r * (1 - a),
    g: f.g * a + b.g * (1 - a),
    b: f.b * a + b.b * (1 - a),
  };
}

/** Relative luminance (Y) from linear RGB. */
function luminance({ r, g, b }: LinearRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between a foreground and a background colour (both
 * `oklch(...)` strings). If the foreground has alpha < 1 it is composited over
 * the (assumed opaque) background first.
 */
export function contrastRatio(fg: string, bg: string): number {
  const fgC = parseOklch(fg);
  const bgC = parseOklch(bg);
  const fgRgb = fgC.alpha < 1 ? compositeOver(fgC, bgC) : oklchToLinearRgb(fgC);
  const l1 = luminance(fgRgb);
  const l2 = luminance(oklchToLinearRgb(bgC));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
