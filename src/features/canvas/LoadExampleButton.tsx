// ============================================================================
// LoadExampleButton — primary entry point for getting a project into the app
// ============================================================================
// The example YAML is bundled via Vite's `?raw` import. Parse goes through
// the schema trust boundary; load goes through the loadProject action.
// ============================================================================

import { loadProject } from "@/core/doc/loadProject";
import { parseProjectYaml } from "@/core/schema/parse";
import exampleYaml from "@/data/example-project.yaml?raw";

interface LoadExampleButtonProps {
  variant?: "primary" | "secondary";
}

export function LoadExampleButton({ variant = "primary" }: LoadExampleButtonProps) {
  const handleClick = () => {
    const result = parseProjectYaml(exampleYaml);
    if (!result.ok) {
      console.error("Failed to load example project:\n" + result.error);
      return;
    }
    loadProject(result.value);
  };

  return (
    <button type="button" className="load-example-btn" data-variant={variant} onClick={handleClick}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span>Load example platform</span>
    </button>
  );
}
