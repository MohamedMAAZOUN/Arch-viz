// ============================================================================
// main.tsx — application entry point
// ============================================================================
// Section 2 of the engineering guide: entry point does ONE thing — bootstrap
// the app. No business logic here.
// ============================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/App";
import { bootstrapExampleProject } from "@/bootstrap";
import { initDraftPersistence } from "@/core/doc/persistence";
import { init as initTheme } from "@/design-system/theme";

import "@/design-system/tokens.css";

initTheme();

// Load the example project. Done synchronously so first render has data.
bootstrapExampleProject();

// Draft persistence runs in the background; failures here don't block UI.
void initDraftPersistence().catch((err: unknown) => {
  console.warn("Draft persistence init failed:", err);
});

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
