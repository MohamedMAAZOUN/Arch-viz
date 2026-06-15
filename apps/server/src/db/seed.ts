// ============================================================================
// Seed — import the repo's bundled architectures as public projects (#60)
// ============================================================================
// Migrates the catalog from build-time `import.meta.glob` discovery to live API
// data: each `architectures/*.yaml` becomes a public project owned by a system
// account, with its document committed as snapshot version 1. Parsing goes
// through the shared `parseProjectYaml` — the same trust boundary the web app
// uses — so a malformed file is reported and skipped, never half-loaded.
//
// Idempotent: a public project already named after a document is left alone, so
// re-running the seed is safe. Run with `pnpm --filter @arch-vis/server db:seed`.
// ============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseProjectYaml } from "@arch-vis/schema";

import { createDb } from "./index";
import { createDrizzleRepository } from "./repository";
import { loadConfig } from "../config";

import type { Repository } from "./repository";

const SYSTEM_EMAIL = "system@arch-vis.local";
const ARCHITECTURES_DIR = fileURLToPath(new URL("../../../../architectures/", import.meta.url));

/** Find the system owner, creating it on first run. */
async function ensureSystemUser(repo: Repository): Promise<string> {
  const existing = await repo.users.findByEmail(SYSTEM_EMAIL);
  if (existing) return existing.id;
  const created = await repo.users.create({
    email: SYSTEM_EMAIL,
    displayName: "System",
    status: "active",
  });
  return created.id;
}

async function seed(): Promise<void> {
  const config = loadConfig(process.env);
  if (!config.ok) {
    console.error(config.error);
    process.exit(1);
  }

  const db = createDb(config.value.databaseUrl);
  const repo = createDrizzleRepository(db);

  try {
    const ownerId = await ensureSystemUser(repo);
    const existingPublic = await repo.projects.listPublic();
    const existingNames = new Set(existingPublic.map((p) => p.name));

    const files = readdirSync(ARCHITECTURES_DIR).filter((f) => /\.ya?ml$/i.test(f));
    let created = 0;

    for (const file of files) {
      const parsed = parseProjectYaml(readFileSync(`${ARCHITECTURES_DIR}${file}`, "utf8"));
      if (!parsed.ok) {
        console.warn(`skip ${file}: invalid document\n${parsed.error}`);
        continue;
      }

      const name = parsed.value.project.name;
      if (existingNames.has(name)) {
        console.info(`skip ${file}: public project "${name}" already exists`);
        continue;
      }

      const project = await repo.projects.create({ name, ownerId, isPublic: true });
      await repo.snapshots.append({
        projectId: project.id,
        version: 1,
        document: parsed.value,
        createdBy: ownerId,
      });
      existingNames.add(name);
      created += 1;
      console.info(`seeded "${name}" from ${file}`);
    }

    const skipped = files.length - created;
    console.info(`Done. ${String(created)} project(s) created, ${String(skipped)} skipped.`);
  } finally {
    await db.close();
  }
}

await seed();
