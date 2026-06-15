import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { loadDocument, storeDocument } from "./persistence";
import { createMemoryRepository } from "../db/repository";

import type { Repository } from "../db/repository";

async function projectId(repo: Repository): Promise<string> {
  const user = await repo.users.create({ email: "a@x.dev", displayName: "A" });
  const project = await repo.projects.create({ name: "P", ownerId: user.id });
  return project.id;
}

describe("yjs persistence", () => {
  it("round-trips a document through the update log", async () => {
    const repo = createMemoryRepository();
    const id = await projectId(repo);
    const svs = new Map<string, Uint8Array>();

    // Author a document and persist it.
    const source = new Y.Doc();
    await loadDocument(repo, id, source, svs);
    source.getMap("root").set("name", "orders-service");
    source.getArray("elements").push(["a", "b"]);
    await storeDocument(repo, id, source, svs);

    // A fresh document, loaded from the log, has the same content.
    const restored = new Y.Doc();
    await loadDocument(repo, id, restored, new Map());
    expect(restored.getMap("root").get("name")).toBe("orders-service");
    expect(restored.getArray("elements").toArray()).toEqual(["a", "b"]);
  });

  it("persists only the delta since the last store", async () => {
    const repo = createMemoryRepository();
    const id = await projectId(repo);
    const svs = new Map<string, Uint8Array>();
    const doc = new Y.Doc();
    await loadDocument(repo, id, doc, svs);

    doc.getMap("root").set("a", 1);
    await storeDocument(repo, id, doc, svs);
    doc.getMap("root").set("b", 2);
    await storeDocument(repo, id, doc, svs);

    expect(await repo.yjsUpdates.count(id)).toBe(2);

    const restored = new Y.Doc();
    await loadDocument(repo, id, restored, new Map());
    expect(restored.getMap("root").get("a")).toBe(1);
    expect(restored.getMap("root").get("b")).toBe(2);
  });

  it("compaction keeps the log bounded under sustained editing", async () => {
    const repo = createMemoryRepository();
    const id = await projectId(repo);
    const svs = new Map<string, Uint8Array>();
    const doc = new Y.Doc();
    await loadDocument(repo, id, doc, svs);

    // Threshold of 3: every store past 3 rows collapses the log to one.
    for (let i = 0; i < 20; i += 1) {
      doc.getMap("root").set(`k${String(i)}`, i);
      await storeDocument(repo, id, doc, svs, 3);
    }

    expect(await repo.yjsUpdates.count(id)).toBeLessThanOrEqual(4);

    // …and the compacted log still reconstructs the full document.
    const restored = new Y.Doc();
    await loadDocument(repo, id, restored, new Map());
    expect(restored.getMap("root").get("k19")).toBe(19);
    expect(restored.getMap("root").get("k0")).toBe(0);
  });
});
