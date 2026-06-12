import { createHash } from "node:crypto";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import type { Plugin } from "vite";

/**
 * Inject a Content-Security-Policy <meta> into the built index.html.
 *
 * Build-only: a strict CSP would break Vite's dev HMR (it injects inline
 * scripts), so we only harden the production bundle that ships to GitHub Pages
 * (which can't set real response headers). The hash of every inline <script>
 * is computed from the final HTML so `script-src` needs no 'unsafe-inline'.
 *
 * `style-src` keeps 'unsafe-inline' because React Flow / Motion set inline
 * style attributes; that is far lower risk than inline script. `connect-src`
 * allows https: so opted-in live (http) data sources can be fetched.
 */
function cspPlugin(): Plugin {
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const inlineScripts = [
          ...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
        ]
          .map((m) => m[1] ?? "")
          .filter((s) => s.trim().length > 0);
        const hashes = inlineScripts.map(
          (s) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`,
        );

        const csp = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(" ")}`.trim(),
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob:",
          "connect-src 'self' https:",
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; ");

        return html.replace(
          /<head>/,
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  worker: {
    format: "es",
  },
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Code-split aggressively per the engineering guide.
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          xyflow: ["@xyflow/react"],
          yjs: ["yjs", "y-indexeddb"],
          motion: ["motion"],
        },
      },
    },
  },
});
