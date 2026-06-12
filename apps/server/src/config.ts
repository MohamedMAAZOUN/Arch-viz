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

const BaseEnvSchema = z.object({
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
});

// Required only when AUTH_OIDC_ENABLED=true. Parsed separately so TypeScript
// knows these are non-optional strings in the OIDC-enabled branch.
const OidcFieldsSchema = z.object({
  OIDC_ISSUER_URL: z.url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REDIRECT_URI: z.url(),
});

export interface OidcConfig {
  readonly issuerUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export interface AppConfig {
  readonly env: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly auth: {
    readonly local: { readonly enabled: boolean };
    readonly oidc: { readonly enabled: false } | ({ readonly enabled: true } & OidcConfig);
  };
}

/** Parse and shape the environment. The only reader of process.env. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Result<AppConfig> {
  const base = BaseEnvSchema.safeParse(env);
  if (!base.success) {
    return err(`Invalid server configuration:\n${z.prettifyError(base.error)}`);
  }
  const e = base.data;

  if (e.AUTH_OIDC_ENABLED) {
    const oidc = OidcFieldsSchema.safeParse(env);
    if (!oidc.success) {
      return err(`OIDC is enabled but required fields are missing:\n${z.prettifyError(oidc.error)}`);
    }
    const o = oidc.data;
    return ok({
      env: e.NODE_ENV,
      host: e.HOST,
      port: e.PORT,
      databaseUrl: e.DATABASE_URL,
      auth: {
        local: { enabled: e.AUTH_LOCAL_ENABLED },
        oidc: {
          enabled: true,
          issuerUrl: o.OIDC_ISSUER_URL,
          clientId: o.OIDC_CLIENT_ID,
          clientSecret: o.OIDC_CLIENT_SECRET,
          redirectUri: o.OIDC_REDIRECT_URI,
        },
      },
    });
  }

  return ok({
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    auth: {
      local: { enabled: e.AUTH_LOCAL_ENABLED },
      oidc: { enabled: false },
    },
  });
}
