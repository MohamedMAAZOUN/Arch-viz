// ============================================================================
// OIDC auth provider — ForgeRock, PKCE, lazy user creation (#58)
// ============================================================================
// Routes:
//   GET /auth/oidc/login    — start the Authorization Code + PKCE flow.
//   GET /auth/oidc/callback — exchange the code, resolve identity, mint session.
//   GET /auth/oidc/logout   — revoke the internal session, optional RP logout.
//
// The login→callback round-trip carries state/nonce/PKCE in a short-lived,
// SIGNED, SameSite=Lax cookie. It MUST be Lax (not Strict like the session
// cookie): the callback is a top-level navigation initiated by the IdP, a
// cross-site GET, so a Strict cookie would not be sent. On success the same
// internal session as local auth is issued — IdP tokens never reach the
// browser and are dropped after the exchange (ADR 0014).
// ============================================================================

import { mapClaimsToProfile } from "./claims";
import { resolveOidcIdentity } from "./resolveIdentity";
import { SESSION_COOKIE } from "../cookies";
import { issueSession } from "../guard";

import type { OidcClient } from "./client";
import type { OidcConfig } from "../../config";
import type { AuthContext, AuthProvider } from "../types";

const OIDC_TX_COOKIE = "arch_vis_oidc_tx";
const OIDC_TX_PATH = "/auth/oidc";

interface OidcTransaction {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

/** Build the provider from an explicit client (the seam tests use). */
export function buildOidcAuthProvider(
  ctx: AuthContext,
  oidcConfig: OidcConfig,
  client: OidcClient,
): AuthProvider {
  const postLoginRedirect = ctx.config.security.allowedOrigins[0] ?? "/";

  const txCookieOptions = (maxAge: number) =>
    ({
      httpOnly: true,
      sameSite: "lax",
      secure: ctx.config.session.secureCookies,
      signed: true,
      path: OIDC_TX_PATH,
      maxAge,
    }) as const;

  return {
    id: "oidc",
    publicConfig: () => ({ mode: "oidc", loginUrl: "/auth/oidc/login" }),

    registerRoutes(app) {
      app.get("/oidc/login", async (_req, reply) => {
        const authRequest = await client.createAuthorizationRequest();
        const tx: OidcTransaction = {
          state: authRequest.state,
          nonce: authRequest.nonce,
          codeVerifier: authRequest.codeVerifier,
        };
        const encoded = Buffer.from(JSON.stringify(tx)).toString("base64url");
        reply.setCookie(OIDC_TX_COOKIE, encoded, txCookieOptions(600));
        return reply.redirect(authRequest.url);
      });

      app.get("/oidc/callback", async (req, reply) => {
        const raw = req.cookies[OIDC_TX_COOKIE];
        if (!raw) return reply.code(400).send({ error: "missing_oidc_transaction" });

        const unsigned = req.unsignCookie(raw);
        reply.clearCookie(OIDC_TX_COOKIE, { path: OIDC_TX_PATH });
        if (!unsigned.valid) {
          return reply.code(400).send({ error: "invalid_oidc_transaction" });
        }

        let tx: OidcTransaction;
        try {
          tx = JSON.parse(Buffer.from(unsigned.value, "base64url").toString()) as OidcTransaction;
        } catch {
          return reply.code(400).send({ error: "invalid_oidc_transaction" });
        }

        // Reconstruct the full callback URL (code + state) the IdP redirected to.
        const currentUrl = new URL(req.url, new URL(oidcConfig.redirectUri).origin);

        let claims: Record<string, unknown>;
        try {
          claims = await client.exchangeCallback({
            currentUrl,
            expectedState: tx.state,
            expectedNonce: tx.nonce,
            codeVerifier: tx.codeVerifier,
          });
        } catch (error) {
          req.log.warn({ err: error }, "oidc code exchange failed");
          return reply.code(401).send({ error: "oidc_exchange_failed" });
        }

        const profile = mapClaimsToProfile(claims);
        if (!profile.ok) return reply.code(401).send({ error: "oidc_invalid_claims" });

        const user = await resolveOidcIdentity(
          { repo: ctx.repo, adminEmails: ctx.config.adminEmails, clock: ctx.clock },
          profile.value,
        );

        // Blocked rejects even when the IdP says yes (ADR 0014).
        if (user.status === "blocked") {
          await ctx.repo.auditLog.record({
            actorId: user.id,
            action: "auth.oidc.blocked",
            target: user.id,
          });
          return reply.code(403).send({ error: "account_blocked" });
        }

        await ctx.repo.users.recordLogin(user.id, ctx.clock());
        await ctx.repo.auditLog.record({
          actorId: user.id,
          action: "auth.oidc.login",
          target: user.id,
        });
        await issueSession(ctx, reply, user.id);
        return reply.redirect(postLoginRedirect);
      });

      app.get("/oidc/logout", async (req, reply) => {
        const token = req.cookies[SESSION_COOKIE];
        if (token) await ctx.sessions.revoke(token);
        reply.clearCookie(SESSION_COOKIE, { path: "/" });

        const endSession = client.endSessionUrl(
          oidcConfig.postLogoutRedirectUri
            ? { postLogoutRedirectUri: oidcConfig.postLogoutRedirectUri }
            : {},
        );
        return reply.redirect(endSession ?? postLoginRedirect);
      });
    },
  };
}

/** Production factory — discovers the IdP, then builds the provider. */
export async function createOidcAuthProvider(ctx: AuthContext): Promise<AuthProvider> {
  if (!ctx.config.auth.oidc.enabled) {
    throw new Error("createOidcAuthProvider called while OIDC is disabled");
  }
  const { createOidcClient } = await import("./client");
  const client = await createOidcClient(ctx.config.auth.oidc);
  return buildOidcAuthProvider(ctx, ctx.config.auth.oidc, client);
}
