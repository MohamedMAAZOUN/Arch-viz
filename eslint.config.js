// ESLint v9 flat config.
// Enforces the engineering guide. The most important custom rule: external
// libraries that have wrappers (xyflow, elkjs, yjs) can be imported ONLY from
// their designated wrapper file. Application code talks to the wrapper.

import js from "@eslint/js";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import importX from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "coverage", "playwright-report", "eslint.config.js", "scripts"],
  },

  // Base TypeScript rules
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },

    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "import-x": importX,
    },

    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        }),
      ],
    },

    rules: {
      // React hooks
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // TypeScript discipline
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // Imports — ordering only (cycle detection added once codebase grows)
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", ["internal", "parent", "sibling", "index"], "type"],
          "newlines-between": "always",
          alphabetize: { order: "asc" },
        },
      ],

      // Code style nudges
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-debugger": "error",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // === WRAPPER-LIBRARY BOUNDARY RULES ===
  // Principle 2 from the engineering guide: external libraries enter through
  // exactly ONE wrapper file. Imports from anywhere else are blocked.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/features/canvas/Canvas.tsx",
      "src/features/canvas/nodes/**",
      "src/features/canvas/edges/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@xyflow/react",
              message:
                "Import React Flow only from src/features/canvas/Canvas.tsx. Application code consumes the Canvas wrapper.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/core/layout/ElkLayoutEngine.ts",
      "src/core/layout/layout.worker.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "elkjs",
              message:
                "Import elkjs only from src/core/layout/ElkLayoutEngine.ts or layout.worker.ts.",
            },
            {
              name: "elkjs/lib/elk.bundled.js",
              message:
                "Do NOT use the bundled build — see the comment in layout.worker.ts. Import elkjs/lib/elk-api.js from layout.worker.ts instead.",
            },
            {
              name: "elkjs/lib/elk-api.js",
              message:
                "Import elk-api only from src/core/layout/layout.worker.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/core/doc/DocStore.ts", "src/core/doc/persistence.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "yjs",
              message:
                "Import yjs only from src/core/doc/DocStore.ts. Application code consumes DocStore operations.",
            },
            {
              name: "y-indexeddb",
              message:
                "Import y-indexeddb only from src/core/doc/persistence.ts.",
            },
          ],
        },
      ],
    },
  },

  // Test files: relax some rules
  {
    files: ["**/*.test.{ts,tsx}", "tests/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
