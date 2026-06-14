// Integration tests for the OIDC routes (#58) with a fake OidcClient — no
// network, no real IdP. They prove the orchestration: the login redirect + PKCE
// transaction cookie, the callback issuing the shared session, blocked-user
// rejection, and exchange failures surfacing as 401. The identity-resolution and
// claims logic are unit-tested separately (resolveIdentity.test, claims.test).

import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { describe, expect, it } from "vitest";

import { buildOidcAuthProvider } from "./provider";
import { loadConfig } from "../../config";
import { createMemoryRepository } from "../../db/repository";
import { createAuthContext } from "../context";

import type { OidcClient } from "./client";
import type { OidcConfig } from "../../config";
import type { Repository } from "../../db/repository";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";

const ORIGIN = "http://localhost:5173";

const OIDC_CONFIG: OidcConfig = {
  issuerUrl: "https://idp.example/oauth2",
  clientId: "arch-vis",
  clientSecret: "s3cret",
  redirectUri: "http://localhost:3001/auth/oidc/callback",
  scopes: "openid email profile",
};

const fakeClient = (over: Partial<OidcClient> = {}): OidcClient => ({
  createAuthorizationRequest: () =>
    Promise.resolve({
      url: "https://idp.example/authorize?response_type=code",
      state: "st",
      nonce: "no",
      codeVerifier: "cv",
    }),
  exchangeCallback: () =>
    Promise.resolve({
      iss: "https://idp.example",
      sub: "sub-1",
      email: "alice@example.com",
      name: "Alice",
    }),
  endSessionUrl: () => null,
  ...over,
});

async function setup(client: OidcClient): Promise<{ app: FastifyInstance; repo: Repository }> {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://arch_vis:arch_vis@localhost:5432/arch_vis",
    WEB_ORIGIN: ORIGIN,
  });
  if (!config.ok) throw new Error(config.error);
  const repo = createMemoryRepository();
  const ctx = createAuthContext(config.value, repo);
  const provider = buildOidcAuthProvider(ctx, OIDC_CONFIG, client);

  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cookie, { secret: config.value.session.cookieSecret });
  await app.register(
    (scope, _opts, done) => {
      void provider.registerRoutes(scope);
      done();
    },
    { prefix: "/auth" },
  );
  return { app, repo };
}

/** The exact `name=value` pair as sent, preserving cookie encoding for replay. */
function rawCookie(res: LightMyRequestResponse, name: string): string | undefined {
  const header = res.headers["set-cookie"];
  const list = Array.isArray(header) ? header : header ? [header] : [];
  const match = list.find((c) => c.startsWith(`${name}=`));
  return match ? match.split(";")[0] : undefined;
}

describe("oidc provider", () => {
  it("GET /auth/oidc/login redirects to the IdP and sets a transaction cookie", async () => {
    const { app } = await setup(fakeClient());
    const res = await app.inject({ method: "GET", url: "/auth/oidc/login" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("https://idp.example/authorize?response_type=code");
    expect(rawCookie(res, "arch_vis_oidc_tx")).toBeDefined();
    await app.close();
  });

  it("callback exchanges the code, provisions the user, and issues a session", async () => {
    const { app, repo } = await setup(fakeClient());
    const login = await app.inject({ method: "GET", url: "/auth/oidc/login" });
    const tx = rawCookie(login, "arch_vis_oidc_tx")!;

    const cb = await app.inject({
      method: "GET",
      url: "/auth/oidc/callback?code=abc&state=st",
      headers: { cookie: tx },
    });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe(ORIGIN);
    expect(rawCookie(cb, "arch_vis_session")).toBeDefined();
    expect(await repo.users.findByEmail("alice@example.com")).not.toBeNull();
    await app.close();
  });

  it("callback without a transaction cookie is 400", async () => {
    const { app } = await setup(fakeClient());
    const cb = await app.inject({ method: "GET", url: "/auth/oidc/callback?code=abc&state=st" });
    expect(cb.statusCode).toBe(400);
    await app.close();
  });

  it("a failed code exchange surfaces as 401 (no session issued)", async () => {
    const { app } = await setup(
      fakeClient({
        exchangeCallback: () => Promise.reject(new Error("state mismatch")),
      }),
    );
    const login = await app.inject({ method: "GET", url: "/auth/oidc/login" });
    const tx = rawCookie(login, "arch_vis_oidc_tx")!;
    const cb = await app.inject({
      method: "GET",
      url: "/auth/oidc/callback?code=abc&state=st",
      headers: { cookie: tx },
    });
    expect(cb.statusCode).toBe(401);
    expect(rawCookie(cb, "arch_vis_session")).toBeUndefined();
    await app.close();
  });

  it("a blocked user is rejected at the callback even though the IdP authenticated them", async () => {
    const { app, repo } = await setup(fakeClient());
    // Pre-existing blocked account with the same email the IdP will return.
    const user = await repo.users.create({
      email: "alice@example.com",
      displayName: "Alice",
      status: "blocked",
    });
    expect(user.status).toBe("blocked");

    const login = await app.inject({ method: "GET", url: "/auth/oidc/login" });
    const tx = rawCookie(login, "arch_vis_oidc_tx")!;
    const cb = await app.inject({
      method: "GET",
      url: "/auth/oidc/callback?code=abc&state=st",
      headers: { cookie: tx },
    });
    expect(cb.statusCode).toBe(403);
    expect(rawCookie(cb, "arch_vis_session")).toBeUndefined();
    await app.close();
  });
});
