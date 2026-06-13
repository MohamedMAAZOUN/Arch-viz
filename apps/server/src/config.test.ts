import { describe, expect, it } from "vitest";

import { loadConfig } from "./config";

const VALID_ENV = {
  DATABASE_URL: "postgres://arch_vis:arch_vis@localhost:5432/arch_vis",
};

describe("loadConfig", () => {
  it("parses a minimal valid environment with defaults", () => {
    const result = loadConfig(VALID_ENV);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.env).toBe("development");
    expect(result.value.host).toBe("0.0.0.0");
    expect(result.value.port).toBe(3001);
    expect(result.value.auth.local.enabled).toBe(true);
    expect(result.value.auth.oidc.enabled).toBe(false);
  });

  it("coerces PORT from the env string", () => {
    const result = loadConfig({ ...VALID_ENV, PORT: "8080" });
    expect(result.ok && result.value.port).toBe(8080);
  });

  it("fails without DATABASE_URL, naming the variable", () => {
    const result = loadConfig({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("DATABASE_URL");
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    const result = loadConfig({ DATABASE_URL: "mysql://root@localhost/db" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("postgres");
  });

  it("rejects AUTH_OIDC_ENABLED=true without the OIDC client settings", () => {
    const result = loadConfig({ ...VALID_ENV, AUTH_OIDC_ENABLED: "true" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const key of [
      "OIDC_ISSUER_URL",
      "OIDC_CLIENT_ID",
      "OIDC_CLIENT_SECRET",
      "OIDC_REDIRECT_URI",
    ]) {
      expect(result.error).toContain(key);
    }
  });

  it("accepts a fully-configured OIDC mode and shapes the union", () => {
    const result = loadConfig({
      ...VALID_ENV,
      AUTH_LOCAL_ENABLED: "false",
      AUTH_OIDC_ENABLED: "true",
      OIDC_ISSUER_URL: "https://am.example.com/am/oauth2/realms/root/realms/r",
      OIDC_CLIENT_ID: "arch-vis",
      OIDC_CLIENT_SECRET: "s3cret",
      OIDC_REDIRECT_URI: "https://app.example.com/auth/oidc/callback",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.auth.local.enabled).toBe(false);
    const oidc = result.value.auth.oidc;
    expect(oidc.enabled).toBe(true);
    if (!oidc.enabled) return;
    expect(oidc.issuerUrl).toContain("am.example.com");
    expect(oidc.clientId).toBe("arch-vis");
  });
});
