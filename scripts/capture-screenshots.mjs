// ============================================================================
// capture-screenshots.mjs — capture README media from the running app
// ============================================================================
// Drives a real browser against a running dev/preview server and saves a PNG
// per layer (and, with --video, a webm walkthrough) into docs/media/. Not part
// of the app bundle; a docs/QA convenience.
//
// Prerequisites:
//   1. pnpm exec playwright install chromium   # one-time, downloads the browser
//   2. pnpm dev                                 # or: pnpm build && pnpm preview
//
// Usage:
//   node scripts/capture-screenshots.mjs                       # PNGs, default URL
//   node scripts/capture-screenshots.mjs --url http://localhost:4173
//   node scripts/capture-screenshots.mjs --video               # also record webm
//
// The browser starts from a clean storage state, so the app seeds its bundled
// "shopfront" example at the latest MVP — a populated graph, no interaction
// needed. GIF conversion (webm → gif) needs ffmpeg; see docs/media/README.md.
// ============================================================================

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "docs/media");

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (flag) => process.argv.includes(flag);

const BASE_URL = arg("--url", "http://localhost:5173");
const RECORD_VIDEO = hasFlag("--video");
const VIEWPORT = { width: 1440, height: 900 };

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // crisp retina-ish captures
    ...(RECORD_VIDEO ? { recordVideo: { dir: OUT_DIR, size: VIEWPORT } } : {}),
  });
  const page = await context.newPage();

  console.log(`→ opening ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  // Wait for the canvas to render at least one node (the seeded example).
  await page.waitForSelector(".react-flow__node", { state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800); // let the entrance/layout settle

  // One screenshot per layer. The layer toggle is a radiogroup labelled "Layer".
  const radios = page.getByRole("radiogroup", { name: "Layer" }).getByRole("radio");
  const count = await radios.count();
  console.log(`→ ${count} layers found`);

  for (let i = 0; i < count; i++) {
    const radio = radios.nth(i);
    const label = (await radio.textContent())?.trim() || `layer-${i}`;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await radio.click();
    await page.waitForTimeout(1200); // wait out the layout transition
    const file = resolve(OUT_DIR, `layer-${slug}.png`);
    await page.screenshot({ path: file });
    console.log(`  ✓ ${file}`);
  }

  if (RECORD_VIDEO) {
    // A short walkthrough: cycle the layers once more so the webm shows motion.
    for (let i = 0; i < count; i++) {
      await radios.nth(i).click();
      await page.waitForTimeout(1500);
    }
  }

  await context.close(); // flushes the video file, if any
  await browser.close();

  if (RECORD_VIDEO) {
    console.log(`→ webm walkthrough saved under ${OUT_DIR} (convert to GIF — see docs/media/README.md)`);
  }
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  console.error(
    "\nIf this is a missing-browser error, run: pnpm exec playwright install chromium",
  );
  process.exit(1);
});
