// ============================================================================
// Auth API — the typed surface of `/auth/*`
// ============================================================================
// Mirrors the server's wire contract (apps/server/src/auth/registerAuth.ts).
// Built on the single `http` boundary, so every response is Zod-parsed and
// every failure is a typed `ApiError`. Identity past login is internal (one
// session cookie), exactly as ADR 0014 specifies — the browser never sees an
// IdP token.
// ============================================================================

import { z } from "zod";

import { http, type ApiResult, type HttpClient } from "@/core/api/http";

export const PublicUser = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  isAdmin: z.boolean(),
  status: z.enum(["active", "disabled", "blocked"]),
});
export type PublicUser = z.infer<typeof PublicUser>;

/** What `GET /auth/config` advertises per enabled mode. */
export const PublicAuthMode = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("local"), registrationEnabled: z.boolean() }),
  z.object({ mode: z.literal("oidc"), loginUrl: z.string() }),
]);
export type PublicAuthMode = z.infer<typeof PublicAuthMode>;

const AuthConfig = z.object({ modes: z.array(PublicAuthMode) });
export type AuthConfig = z.infer<typeof AuthConfig>;

const MeResponse = z.object({ user: PublicUser });
const UserResponse = z.object({ user: PublicUser });
const WsTokenResponse = z.object({ token: z.string(), expiresInMs: z.number() });
export type WsToken = z.infer<typeof WsTokenResponse>;

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface RegisterInput extends LoginInput {
  readonly displayName?: string;
}

export interface AuthApi {
  getConfig(): Promise<ApiResult<AuthConfig>>;
  getMe(): Promise<ApiResult<PublicUser>>;
  login(input: LoginInput): Promise<ApiResult<PublicUser>>;
  register(input: RegisterInput): Promise<ApiResult<PublicUser>>;
  logout(): Promise<ApiResult<undefined>>;
  /** Short-lived signed JWT for the multiplayer WebSocket handshake (#65). */
  getWsToken(): Promise<ApiResult<WsToken>>;
}

export function createAuthApi(client: HttpClient = http): AuthApi {
  return {
    getConfig: () => client.request("/auth/config", { schema: AuthConfig }),
    getMe: async () => unwrapUser(await client.request("/auth/me", { schema: MeResponse })),
    login: async (input) =>
      unwrapUser(
        await client.request("/auth/login", { method: "POST", body: input, schema: UserResponse }),
      ),
    register: async ({ email, password, displayName }) =>
      unwrapUser(
        await client.request("/auth/register", {
          method: "POST",
          body: displayName === undefined ? { email, password } : { email, password, displayName },
          schema: UserResponse,
        }),
      ),
    logout: () => client.requestVoid("/auth/logout", { method: "POST" }),
    getWsToken: () => client.request("/auth/ws-token", { schema: WsTokenResponse }),
  };
}

/** Collapse the `{ user }` envelope to the user (keeps call sites flat). */
function unwrapUser(result: ApiResult<{ user: PublicUser }>): ApiResult<PublicUser> {
  return result.ok ? { ok: true, value: result.value.user } : result;
}

export const authApi: AuthApi = createAuthApi();
