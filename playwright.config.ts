// ============================================================================
// Playwright config — end-to-end tests
// ============================================================================
// E2E specs live in `tests/` (the only thing that folder is for — unit tests
// sit next to the code they cover). They drive the real app in a browser:
// Vite serves it, Playwright loads it, drives the UI, and asserts behaviour.
//
// The app is served via `webServer` so `pnpm test:e2e` is a one-liner both
// locally and in CI. We test the PRODUCTION build (`vite build` + `vite
// preview`), not the dev server: that is the artifact users actually run, and
// it sidesteps React StrictMode's dev-only double-mount of effects (which the
// async ELK-in-a-worker layout pipeline is sensitive to on first paint).
// Locally an already-running preview server is reused; CI builds fresh.
// ============================================================================

import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const BASE_URL = `http://localhost:${String(PORT)}`;

export default defineConfig({
  testDir: "./tests",
  // Fail the build if a `test.only` is committed by accident.
  forbidOnly: Boolean(process.env["CI"]),
  // One retry in CI absorbs genuine infra flake without masking real failures.
  retries: process.env["CI"] ? 1 : 0,
  // IndexedDB-backed specs must not race each other; one worker keeps the
  // persisted-draft state deterministic. (Each test still gets a fresh
  // browser context, so storage is isolated per test.)
  workers: 1,
  reporter: process.env["CI"]
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `pnpm build && pnpm preview --port ${String(PORT)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
