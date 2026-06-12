// Validate a project YAML against the live Zod schema.
// Usage: npx vite-node scripts/validate.mjs <path-to-yaml>
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { ProjectDocument } from "../packages/schema/src/schema.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: vite-node scripts/validate.mjs <file.yaml>");
  process.exit(2);
}
const raw = parse(readFileSync(file, "utf8"));
const result = ProjectDocument.safeParse(raw);
if (result.success) {
  const d = result.data;
  console.log(`✅ VALID: ${file}`);
  console.log(`   ${d.elements.length} elements, ${d.connections.length} connections, ${d.mvps.length} MVPs, ${d.tours?.length ?? 0} tours`);
} else {
  console.log(`❌ INVALID: ${file}`);
  for (const issue of result.error.issues.slice(0, 20)) {
    console.log(`   • ${issue.path.join(".") || "<root>"}: ${issue.message}`);
  }
  process.exit(1);
}
