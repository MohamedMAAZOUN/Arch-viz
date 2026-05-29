/// <reference types="vitest" />
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    css: false,
    coverage: {
      reporter: ["text", "html"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/node_modules/**"],
    },
  },
});
