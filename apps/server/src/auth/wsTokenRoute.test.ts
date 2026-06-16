import { describe, expect, it } from "vitest";

import { verifyWsToken } from "./wsToken";
import { get, registerUser, setup, testConfig } from "../testkit";

describe("GET /auth/ws-token", () => {
  it("issues a verifiable token to an authenticated user", async () => {
    const { app } = await setup();
    const { cookie, id } = await registerUser(app, "ws@x.dev");

    const res = await app.inject(get("/auth/ws-token", cookie));
    expect(res.statusCode).toBe(200);

    const body = res.json<{ token: string; expiresInMs: number }>();
    expect(body.expiresInMs).toBeGreaterThan(0);

    const verified = verifyWsToken(body.token, testConfig().session.cookieSecret);
    expect(verified).toEqual({ ok: true, value: { userId: id } });
  });

  it("rejects an anonymous request", async () => {
    const { app } = await setup();
    const res = await app.inject(get("/auth/ws-token"));
    expect(res.statusCode).toBe(401);
  });
});
