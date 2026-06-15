// Integration tests for the admin surface (#59): status lifecycle, audit log,
// and the admin/non-admin/anonymous authorization split. Driven through
// app.inject() against the in-memory repository.

import { describe, expect, it } from "vitest";

import { get, post, registerUser, setup } from "../testkit";

const ADMIN = "admin@example.com";

/** Build an app whose `admin@example.com` is seeded as an admin on register. */
async function setupWithAdmin() {
  const ctx = await setup({ ADMIN_EMAILS: ADMIN });
  const admin = await registerUser(ctx.app, ADMIN);
  return { ...ctx, admin };
}

describe("admin authorization", () => {
  it("a non-admin gets 403, anonymous gets 401", async () => {
    const { app } = await setupWithAdmin();
    const member = await registerUser(app, "member@example.com");

    const anon = await app.inject(get("/admin/users"));
    expect(anon.statusCode).toBe(401);

    const nonAdmin = await app.inject(get("/admin/users", member.cookie));
    expect(nonAdmin.statusCode).toBe(403);

    await app.close();
  });

  it("an admin can list users", async () => {
    const { app, admin } = await setupWithAdmin();
    await registerUser(app, "bob@example.com");

    const res = await app.inject(get("/admin/users", admin.cookie));
    expect(res.statusCode).toBe(200);
    const emails = res.json<{ users: { email: string }[] }>().users.map((u) => u.email);
    expect(emails).toContain(ADMIN);
    expect(emails).toContain("bob@example.com");

    await app.close();
  });
});

describe("status lifecycle", () => {
  it("blocking revokes live sessions and 401s the next request, and audits", async () => {
    const { app, repo, admin } = await setupWithAdmin();
    const carol = await registerUser(app, "carol@example.com");

    // Carol's live session works before the block.
    expect((await app.inject(get("/auth/me", carol.cookie))).statusCode).toBe(200);

    const block = await app.inject(
      post(`/admin/users/${carol.id}/block`, { cookie: admin.cookie }),
    );
    expect(block.statusCode).toBe(200);
    expect(block.json<{ user: { status: string } }>().user.status).toBe("blocked");

    // Next request on the same cookie is rejected immediately.
    expect((await app.inject(get("/auth/me", carol.cookie))).statusCode).toBe(401);

    // A blocked user cannot log back in even with the right password.
    const relogin = await app.inject(
      post("/auth/login", { payload: { email: "carol@example.com", password: "password123" } }),
    );
    expect(relogin.statusCode).toBe(403);

    // The mutation was audited.
    const audit = await repo.auditLog.list(carol.id);
    expect(audit.some((a) => a.action === "admin.user.block" && a.actorId === admin.id)).toBe(true);

    await app.close();
  });

  it("disabling lets the user re-enable on successful login; blocking does not", async () => {
    const { app, admin } = await setupWithAdmin();
    const dave = await registerUser(app, "dave@example.com");

    const disable = await app.inject(
      post(`/admin/users/${dave.id}/disable`, { cookie: admin.cookie }),
    );
    expect(disable.json<{ user: { status: string } }>().user.status).toBe("disabled");

    // Logging in succeeds and self-heals disabled → active.
    const login = await app.inject(
      post("/auth/login", { payload: { email: "dave@example.com", password: "password123" } }),
    );
    expect(login.statusCode).toBe(200);
    expect(login.json<{ user: { status: string } }>().user.status).toBe("active");

    await app.close();
  });

  it("unblock returns a blocked user to active", async () => {
    const { app, admin } = await setupWithAdmin();
    const erin = await registerUser(app, "erin@example.com");

    await app.inject(post(`/admin/users/${erin.id}/block`, { cookie: admin.cookie }));
    const unblock = await app.inject(
      post(`/admin/users/${erin.id}/unblock`, { cookie: admin.cookie }),
    );
    expect(unblock.statusCode).toBe(200);
    expect(unblock.json<{ user: { status: string } }>().user.status).toBe("active");

    // Now login works again.
    const login = await app.inject(
      post("/auth/login", { payload: { email: "erin@example.com", password: "password123" } }),
    );
    expect(login.statusCode).toBe(200);

    await app.close();
  });

  it("an admin cannot block or disable themselves", async () => {
    const { app, admin } = await setupWithAdmin();
    const block = await app.inject(
      post(`/admin/users/${admin.id}/block`, { cookie: admin.cookie }),
    );
    expect(block.statusCode).toBe(400);
    const disable = await app.inject(
      post(`/admin/users/${admin.id}/disable`, { cookie: admin.cookie }),
    );
    expect(disable.statusCode).toBe(400);
    await app.close();
  });

  it("acting on an unknown user is 404", async () => {
    const { app, admin } = await setupWithAdmin();
    const res = await app.inject(
      post(`/admin/users/00000000-0000-0000-0000-000000000000/block`, { cookie: admin.cookie }),
    );
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
