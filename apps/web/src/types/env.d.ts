// Typed access to the Vite env vars this app reads. Merges into vite/client's
// `ImportMetaEnv` so `import.meta.env.VITE_API_BASE_URL` is a known property
// (required under `noPropertyAccessFromIndexSignature`).
interface ImportMetaEnv {
  /**
   * Base URL of the backend API (ADR 0014). Empty/undefined means same-origin
   * (the production default — one container serves the SPA and the API). In
   * local dev the web app runs on :5173 and the server on :3001, so point this
   * at `http://localhost:3001`.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
