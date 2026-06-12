// ============================================================================
// main.tsx — application entry point
// ============================================================================
// Section 2 of the engineering guide: entry point does ONE thing — bootstrap
// the app. No business logic here.
//
// Order matters: we restore the persisted draft FIRST, then seed the initial
// project. Seeding before the IndexedDB sync completes would clobber a
// returning user's draft (the fresh example would win the CRDT merge), so the
// app waits for persistence before deciding whether to seed the example.
// ============================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/App";
import { bootstrapInitialProject } from "@/bootstrap";
import { initDraftPersistence } from "@/core/doc/persistence";
import { init as initTheme } from "@/design-system/theme";

import "@/design-system/tokens.css";

initTheme();

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Root element #root not found");
}
const root = createRoot(rootElement);

async function start(): Promise<void> {
  // Restore any persisted draft before seeding. A failure here is non-fatal:
  // we fall back to seeding the example so the app still renders.
  try {
    await initDraftPersistence();
  } catch (err) {
    console.warn("Draft persistence init failed:", err);
  }

  bootstrapInitialProject();

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
