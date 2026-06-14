// ============================================================================
// Server configuration — the env trust boundary
// ============================================================================
// "Boundaries validate" (engineering guide § 1): process.env crosses into the
// application exactly once, here, through Zod. Past this point the config is
// a trusted, fully-typed value. Misconfiguration is an expected failure, so
// `loadConfig` returns a Result; the boot sequence prints the error and exits
// non-zero (fail fast — ADR 0014).
//
// Auth modes (ADR 0014): local and OIDC (ForgeRock) coexist; each is
// toggleable per deployment. Enabling OIDC requires the full OIDC client
// configuration — the two-step parse below makes TypeScript's types reflect
// this invariant without unsafe assertions.
// ============================================================================

import { err, ok } from "@arch-vis/schema";
import { z } from "zod";

import type { Result } from "@arch-vis/schema";

/** "true"/"false" env strings → boolean (env vars are always strings). */
const boolEnv = (defaultValue: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(defaultValue)
    .transform((v) => v === "true");

const BaseEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z
      .url()
      .refine((u) => u.startsWith("postgres://") || u.startsWith("postgresql://"), {
        message: "DATABASE_URL must be a postgres:// or postgresql:// URL",
      }),

    AUTH_LOCAL_ENABLED: boolEnv("true"),
    AUTH_OIDC_ENABLED: boolEnv("false"),
    // Self-service registration can be turned off while local login stays on.
    AUTH_REGISTRATION_ENABLED: boolEnv("true"),

    // --- sessions & cookies (#57) ---
    // Signs short-lived cookies (e.g. the OIDC PKCE state). Session tokens are
    // opaque and stored hashed, so they are not signed by this secret.
    SESSION_SECRET: z.string().min(16).default("dev-insecure-session-secret-please-change"),
    SESSION_IDLE_TTL_MIN: z.coerce.number().int().positive().default(720), // 12h
    SESSION_ABSOLUTE_TTL_MIN: z.coerce.number().int().positive().default(10_080), // 7d
    SESSION_ROTATION_MIN: z.coerce.number().int().positive().default(10),
    // Force the Secure cookie flag. Defaults on in production, off elsewhere so
    // http://localhost works in dev.
    COOKIE_SECURE: z.enum(["true", "false"]).optional(),

    // CSRF origin-check allow-list (comma-separated): the web origin(s) allowed
    // to call state-changing routes with the session cookie.
    WEB_ORIGIN: z.string().default("http://localhost:5173"),

    // Comma-separated admin emails; matched case-insensitively to seed is_admin.
    ADMIN_EMAILS: z.string().default(""),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === "production" && e.SESSION_SECRET.startsWith("dev-insecure")) {
      ctx.addIssue({
        code: "custom",
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be set to a strong value in production",
      });
    }
  });

// Required only when AUTH_OIDC_ENABLED=true. Parsed separately so TypeScript
// knows these are non-optional strings in the OIDC-enabled branch.
const OidcFieldsSchema = z.object({
  OIDC_ISSUER_URL: z.url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REDIRECT_URI: z.url(),
  OIDC_SCOPES: z.string().default("openid profile email"),
  OIDC_POST_LOGOUT_REDIRECT_URI: z.url().optional(),
});

/** Split a comma-separated env value into trimmed, non-empty entries. */
const splitList = (raw: string): readonly string[] =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export interface OidcConfig {
  readonly issuerUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly scopes: string;
  readonly postLogoutRedirectUri?: string;
}

export interface SessionConfig {
  readonly idleTtlMs: number;
  readonly absoluteTtlMs: number;
  readonly rotationIntervalMs: number;
  readonly cookieSecret: string;
  readonly secureCookies: boolean;
}

export interface AppConfig {
  readonly env: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly auth: {
    readonly local: { readonly enabled: boolean; readonly registrationEnabled: boolean };
    readonly oidc: { readonly enabled: false } | ({ readonly enabled: true } & OidcConfig);
  };
  readonly session: SessionConfig;
  readonly security: { readonly allowedOrigins: readonly string[] };
  readonly adminEmails: ReadonlySet<string>;
}

type BaseEnv = z.infer<typeof BaseEnvSchema>;

/** The mode-agnostic config fields, shared by both auth branches. */
function commonConfig(e: BaseEnv): Omit<AppConfig, "auth"> & {
  auth: { local: AppConfig["auth"]["local"] };
} {
  const MIN = 60_000;
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    session: {
      idleTtlMs: e.SESSION_IDLE_TTL_MIN * MIN,
      absoluteTtlMs: e.SESSION_ABSOLUTE_TTL_MIN * MIN,
      rotationIntervalMs: e.SESSION_ROTATION_MIN * MIN,
      cookieSecret: e.SESSION_SECRET,
      secureCookies: e.COOKIE_SECURE ? e.COOKIE_SECURE === "true" : e.NODE_ENV === "production",
    },
    security: { allowedOrigins: splitList(e.WEB_ORIGIN) },
    adminEmails: new Set(splitList(e.ADMIN_EMAILS).map((s) => s.toLowerCase())),
    auth: {
      local: { enabled: e.AUTH_LOCAL_ENABLED, registrationEnabled: e.AUTH_REGISTRATION_ENABLED },
    },
  };
}

/** Parse and shape the environment. The only reader of process.env. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Result<AppConfig> {
  const base = BaseEnvSchema.safeParse(env);
  if (!base.success) {
    return err(`Invalid server configuration:\n${z.prettifyError(base.error)}`);
  }
  const e = base.data;
  const common = commonConfig(e);

  if (e.AUTH_OIDC_ENABLED) {
    const oidc = OidcFieldsSchema.safeParse(env);
    if (!oidc.success) {
      return err(
        `OIDC is enabled but required fields are missing:\n${z.prettifyError(oidc.error)}`,
      );
    }
    const o = oidc.data;
    return ok({
      ...common,
      auth: {
        local: common.auth.local,
        oidc: {
          enabled: true,
          issuerUrl: o.OIDC_ISSUER_URL,
          clientId: o.OIDC_CLIENT_ID,
          clientSecret: o.OIDC_CLIENT_SECRET,
          redirectUri: o.OIDC_REDIRECT_URI,
          scopes: o.OIDC_SCOPES,
          ...(o.OIDC_POST_LOGOUT_REDIRECT_URI
            ? { postLogoutRedirectUri: o.OIDC_POST_LOGOUT_REDIRECT_URI }
            : {}),
        },
      },
    });
  }

  return ok({ ...common, auth: { local: common.auth.local, oidc: { enabled: false } } });
}
