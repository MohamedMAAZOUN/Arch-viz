// Integration tests for the /projects surface (#60 CRUD + guest reads, #61
// sharing, #62 snapshot history). Driven through app.inject() against the
// in-memory repository; documents round-trip through the real shared parser.

import { parseProjectJson } from "@arch-vis/schema";
import { describe, expect, it } from "vitest";

import { del, get, patch, post, registerUser, setup, validDocument } from "../testkit";

import type { FastifyInstance } from "fastify";

/** Create a project owned by `cookie`; returns its id. */
async function createProject(
  app: FastifyInstance,
  cookie: string,
  opts: { name?: string; document?: unknown } = {},
): Promise<string> {
  const res = await app.inject(post("/projects", { cookie, payload: opts }));
  if (res.statusCode !== 201) {
    throw new Error(`create failed: ${String(res.statusCode)} ${res.body}`);
  }
  return res.json<{ project: { id: string } }>().project.id;
}

describe("projects CRUD + guest reads (#60)", () => {
  it("a guest sees only public projects and cannot create", async () => {
    const { app, repo } = await setup();
    const owner = await registerUser(app, "owner@example.com");

    const privateId = await createProject(app, owner.cookie, { name: "Private" });
    // No public-toggle endpoint in v1 — bundled/public projects are seeded
    // directly (the seed script does this for architectures/*.yaml).
    const seeded = await repo.projects.create({
      name: "Bundled",
      ownerId: owner.id,
      isPublic: true,
    });

    const guestList = await app.inject(get("/projects"));
    expect(guestList.statusCode).toBe(200);
    const ids = guestList.json<{ projects: { id: string }[] }>().projects.map((p) => p.id);
    expect(ids).toContain(seeded.id);
    expect(ids).not.toContain(privateId);

    // Guest can read the public one, not the private one.
    expect((await app.inject(get(`/projects/${seeded.id}`))).statusCode).toBe(200);
    expect((await app.inject(get(`/projects/${privateId}`))).statusCode).toBe(404);

    // Guest cannot create.
    const create = await app.inject(post("/projects", { payload: { name: "Nope" } }));
    expect(create.statusCode).toBe(401);

    await app.close();
  });

  it("an authenticated user lists own + shared projects", async () => {
    const { app } = await setup();
    const owner = await registerUser(app, "owner@example.com");
    const friend = await registerUser(app, "friend@example.com");

    const mine = await createProject(app, owner.cookie, { name: "Mine" });
    const shared = await createProject(app, friend.cookie, { name: "Shared" });
    await app.inject(
      post(`/projects/${shared}/members`, {
        cookie: friend.cookie,
        payload: { email: "owner@example.com", role: "viewer" },
      }),
    );

    const list = await app.inject(get("/projects", owner.cookie));
    const ids = list.json<{ projects: { id: string }[] }>().projects.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([mine, shared]));

    await app.close();
  });

  it("a project document round-trips through the shared parser", async () => {
    const { app } = await setup();
    const owner = await registerUser(app, "owner@example.com");
    const id = await createProject(app, owner.cookie, { document: validDocument("Round Trip") });

    const res = await app.inject(get(`/projects/${id}`, owner.cookie));
    expect(res.statusCode).toBe(200);
    const body = res.json<{ document: unknown; version: number }>();
    expect(body.version).toBe(1);
    const reparsed = parseProjectJson(body.document);
    expect(reparsed.ok).toBe(true);

    await app.close();
  });

  it("only the owner can delete; rename needs at least editor", async () => {
    const { app } = await setup();
    const owner = await registerUser(app, "owner@example.com");
    const viewer = await registerUser(app, "viewer@example.com");
    const id = await createProject(app, owner.cookie, { name: "Doc" });
    await app.inject(
      post(`/projects/${id}/members`, {
        cookie: owner.cookie,
        payload: { email: "viewer@example.com", role: "viewer" },
      }),
    );

    // Viewer cannot rename or delete.
    expect(
      (
        await app.inject(
          patch(`/projects/${id}`, { cookie: viewer.cookie, payload: { name: "x" } }),
        )
      ).statusCode,
    ).toBe(403);
    expect((await app.inject(del(`/projects/${id}`, { cookie: viewer.cookie }))).statusCode).toBe(
      403,
    );

    // Owner can.
    const rename = await app.inject(
      patch(`/projects/${id}`, { cookie: owner.cookie, payload: { name: "Renamed" } }),
    );
    expect(rename.statusCode).toBe(200);
    expect(rename.json<{ project: { name: string } }>().project.name).toBe("Renamed");
    expect((await app.inject(del(`/projects/${id}`, { cookie: owner.cookie }))).statusCode).toBe(
      204,
    );

    await app.close();
  });
});

describe("sharing — viewer/editor roles (#61)", () => {
  it("viewer reads but cannot mutate; editor mutates but cannot manage or delete", async () => {
    const { app } = await setup();
    const owner = await registerUser(app, "owner@example.com");
    const viewer = await registerUser(app, "viewer@example.com");
    const editor = await registerUser(app, "editor@example.com");
    const id = await createProject(app, owner.cookie, { name: "Team" });

    for (const [email, role] of [
      ["viewer@example.com", "viewer"],
      ["editor@example.com", "editor"],
    ] as const) {
      const invite = await app.inject(
        post(`/projects/${id}/members`, { cookie: owner.cookie, payload: { email, role } }),
      );
      expect(invite.statusCode).toBe(201);
    }

    // Viewer: can read, cannot patch / snapshot / delete.
    expect((await app.inject(get(`/projects/${id}`, viewer.cookie))).statusCode).toBe(200);
    expect(
      (
        await app.inject(
          patch(`/projects/${id}`, { cookie: viewer.cookie, payload: { name: "x" } }),
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject(
          post(`/projects/${id}/snapshots`, {
            cookie: viewer.cookie,
            payload: { document: validDocument() },
          }),
        )
      ).statusCode,
    ).toBe(403);

    // Editor: can patch + snapshot, but cannot manage members or delete.
    expect(
      (
        await app.inject(
          patch(`/projects/${id}`, { cookie: editor.cookie, payload: { name: "Edited" } }),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject(
          post(`/projects/${id}/snapshots`, {
            cookie: editor.cookie,
            payload: { document: validDocument() },
          }),
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject(
          post(`/projects/${id}/members`, {
            cookie: editor.cookie,
            payload: { email: "x@example.com", role: "viewer" },
          }),
        )
      ).statusCode,
    ).toBe(403);
    expect((await app.inject(del(`/projects/${id}`, { cookie: editor.cookie }))).statusCode).toBe(
      403,
    );

    await app.close();
  });

  it("inviting an email with no account is rejected with a clear error", async () => {
    const { app } = await setup();
    const owner = await registerUser(app, "owner@example.com");
    const id = await createProject(app, owner.cookie, { name: "Solo" });

    const invite = await app.inject(
      post(`/projects/${id}/members`, {
        cookie: owner.cookie,
        payload: { email: "ghost@example.com", role: "viewer" },
      }),
    );
    expect(invite.statusCode).toBe(404);
    expect(invite.json<{ error: string }>().error).toBe("no_account_for_email");

    await app.close();
  });

  it("owner can list, change role, and remove members", async () => {
    const { app } = await setup();
    const owner = await registerUser(app, "owner@example.com");
    const member = await registerUser(app, "member@example.com");
    const id = await createProject(app, owner.cookie, { name: "Managed" });

    await app.inject(
      post(`/projects/${id}/members`, {
        cookie: owner.cookie,
        payload: { email: "member@example.com", role: "viewer" },
      }),
    );

    const list = await app.inject(get(`/projects/${id}/members`, owner.cookie));
    expect(list.json<{ members: { userId: string; role: string }[] }>().members).toEqual([
      expect.objectContaining({ userId: member.id, role: "viewer" }),
    ]);

    const change = await app.inject(
      patch(`/projects/${id}/members/${member.id}`, {
        cookie: owner.cookie,
        payload: { role: "editor" },
      }),
    );
    expect(change.json<{ role: string }>().role).toBe("editor");

    const remove = await app.inject(
      del(`/projects/${id}/members/${member.id}`, { cookie: owner.cookie }),
    );
    expect(remove.statusCode).toBe(204);
    expect(
      (await app.inject(get(`/projects/${id}/members`, owner.cookie))).json<{
        members: unknown[];
      }>().members,
    ).toHaveLength(0);

    await app.close();
  });
});

describe("append-only snapshot history (#62)", () => {
  it("two commits produce versions 1 and 2, both fetchable and re-parseable", async () => {
    const { app } = await setup();
    const owner = await registerUser(app, "owner@example.com");
    const id = await createProject(app, owner.cookie, { name: "History" });

    const c1 = await app.inject(
      post(`/projects/${id}/snapshots`, {
        cookie: owner.cookie,
        payload: { document: validDocument("v1") },
      }),
    );
    const c2 = await app.inject(
      post(`/projects/${id}/snapshots`, {
        cookie: owner.cookie,
        payload: { document: validDocument("v2") },
      }),
    );
    expect(c1.json<{ version: number }>().version).toBe(1);
    expect(c2.json<{ version: number }>().version).toBe(2);

    const list = await app.inject(get(`/projects/${id}/snapshots`, owner.cookie));
    expect(
      list.json<{ snapshots: { version: number }[] }>().snapshots.map((s) => s.version),
    ).toEqual([1, 2]);

    // Both versions remain fetchable and re-parse through the shared schema.
    for (const v of [1, 2]) {
      const res = await app.inject(get(`/projects/${id}/snapshots/${String(v)}`, owner.cookie));
      expect(res.statusCode).toBe(200);
      expect(parseProjectJson(res.json<{ document: unknown }>().document).ok).toBe(true);
    }

    await app.close();
  });

  it("an invalid document is rejected; history is never mutated", async () => {
    const { app } = await setup();
    const owner = await registerUser(app, "owner@example.com");
    const id = await createProject(app, owner.cookie, { name: "Strict" });

    const bad = await app.inject(
      post(`/projects/${id}/snapshots`, {
        cookie: owner.cookie,
        payload: { document: { nope: 1 } },
      }),
    );
    expect(bad.statusCode).toBe(422);

    await app.close();
  });
});
