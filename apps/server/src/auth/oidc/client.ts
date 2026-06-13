// ============================================================================
// openid-client wrapper — the single boundary for OIDC (#58)
// ============================================================================
// All use of `openid-client` lives here (the server-side "wrap external
// libraries" rule). Endpoints + JWKS are discovered from the issuer URL, so
// configuration is just the issuer (ForgeRock AM is spec-compliant). The flow
// is Authorization Code + PKCE; the provider talks to this `OidcClient`
// interface, which makes the route logic testable with a fake.
// ============================================================================

import * as oidc from "openid-client";

import type { OidcConfig } from "../../config";

export interface AuthorizationRequest {
  /** Where to redirect the browser to begin login. */
  readonly url: string;
  /** Per-request anti-CSRF/replay values, stashed for the callback to verify. */
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

export interface ExchangeInput {
  readonly currentUrl: URL;
  readonly expectedState: string;
  readonly expectedNonce: string;
  readonly codeVerifier: string;
}

export interface OidcClient {
  /** Build the authorization redirect with a fresh PKCE verifier, state, nonce. */
  createAuthorizationRequest(): Promise<AuthorizationRequest>;
  /**
   * Exchange the callback URL for validated ID-token claims. Throws if the
   * code, state, nonce, PKCE, or signature checks fail. The returned claims are
   * the ONLY thing that escapes — IdP tokens are dropped here, never surfaced.
   */
  exchangeCallback(input: ExchangeInput): Promise<Record<string, unknown>>;
  /** RP-initiated logout URL, or null when the IdP exposes no end_session_endpoint. */
  endSessionUrl(input: { postLogoutRedirectUri?: string }): string | null;
}

export async function createOidcClient(config: OidcConfig): Promise<OidcClient> {
  const configuration = await oidc.discovery(
    new URL(config.issuerUrl),
    config.clientId,
    config.clientSecret,
  );

  return {
    async createAuthorizationRequest() {
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const url = oidc.buildAuthorizationUrl(configuration, {
        redirect_uri: config.redirectUri,
        scope: config.scopes,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
        nonce,
      });
      return { url: url.href, state, nonce, codeVerifier };
    },

    async exchangeCallback({ currentUrl, expectedState, expectedNonce, codeVerifier }) {
      const tokens = await oidc.authorizationCodeGrant(configuration, currentUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState,
        expectedNonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) throw new Error("token response contained no id token claims");
      return { ...claims };
    },

    endSessionUrl({ postLogoutRedirectUri }) {
      if (!configuration.serverMetadata().end_session_endpoint) return null;
      const url = oidc.buildEndSessionUrl(
        configuration,
        postLogoutRedirectUri ? { post_logout_redirect_uri: postLogoutRedirectUri } : {},
      );
      return url.href;
    },
  };
}
