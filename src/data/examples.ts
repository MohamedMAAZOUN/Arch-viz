// ============================================================================
// examples — catalog of bundled example projects (lazy-loaded)
// ============================================================================
// Central registry shared by the example picker (in Settings) and bootstrap.
//
// Each example's YAML is loaded ON DEMAND via dynamic import (Vite emits each
// as its own chunk). This keeps the large scale-test fixtures out of the main
// bundle — they're only fetched when the user actually picks them.
//
// To add an example: drop a .yaml in src/data/, validate it against the
// schema, and add an entry here with a loader.
// ============================================================================

export interface ExampleEntry {
  id: string;
  name: string;
  description: string;
  /** Rough element count, for display. */
  size: string;
  /** Lazily fetch the raw YAML for this example. */
  load: () => Promise<string>;
}

export const EXAMPLES: readonly ExampleEntry[] = [
  {
    id: "shopfront",
    name: "Shopfront (simple)",
    description: "A small e-commerce platform. Good for a first look.",
    size: "~12 elements",
    load: () => import("@/data/example-project.yaml?raw").then((m) => m.default),
  },
  {
    id: "aurora",
    name: "Aurora Platform (realistic)",
    description: "A fintech platform across 5 quarters — banking, payments, lending, ML.",
    size: "42 elements",
    load: () => import("@/data/aurora-platform.yaml?raw").then((m) => m.default),
  },
  {
    id: "scale-100",
    name: "Scale Test — 100",
    description: "Synthetic mid-size graph for layout testing.",
    size: "~90 elements",
    load: () => import("@/data/scale-test-100.yaml?raw").then((m) => m.default),
  },
  {
    id: "scale-300",
    name: "Scale Test — 300",
    description: "Synthetic large graph. Stresses layout and rendering (~1s layout).",
    size: "~280 elements",
    load: () => import("@/data/scale-test-300.yaml?raw").then((m) => m.default),
  },
];

export const DEFAULT_EXAMPLE_ID = "shopfront";

export function getExample(id: string): ExampleEntry | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
