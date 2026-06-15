import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthConfig, PublicUser } from "@/core/api/auth";
import type { ApiResult } from "@/core/api/http";

// The session layer wires a 401 handler through the http boundary at import; we
// capture it so we can simulate a mid-session expiry deterministically.
let unauthorizedHandler: (() => void) | null = null;
vi.mock("@/core/api/http", () => ({
  setUnauthorizedHandler: (h: (() => void) | null) => {
    unauthorizedHandler = h;
  },
}));

const authApi = {
  getConfig: vi.fn<() => Promise<ApiResult<AuthConfig>>>(),
  getMe: vi.fn<() => Promise<ApiResult<PublicUser>>>(),
  login: vi.fn<() => Promise<ApiResult<PublicUser>>>(),
  register: vi.fn<() => Promise<ApiResult<PublicUser>>>(),
  logout: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  getWsToken: vi.fn(),
};
vi.mock("@/core/api/auth", () => ({ authApi }));

const { useSessionStore } = await import("@/core/state/sessionStore");

const user: PublicUser = {
  id: "u1",
  email: "ada@x.dev",
  displayName: "Ada",
  isAdmin: false,
  status: "active",
};
const config: AuthConfig = { modes: [{ mode: "local", registrationEnabled: true }] };

describe("sessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState({ status: "loading", user: null, config: null, loginPrompt: null, justLoggedIn: false });
    vi.clearAllMocks();
  });

  it("boots to guest when there is no session", async () => {
    authApi.getConfig.mockResolvedValue({ ok: true, value: config });
    authApi.getMe.mockResolvedValue({ ok: false, error: { kind: "unauthorized", message: "unauthorized" } });
    await useSessionStore.getState().init();
    expect(useSessionStore.getState().status).toBe("guest");
    expect(useSessionStore.getState().config).toEqual(config);
  });

  it("boots to authenticated when a session resolves", async () => {
    authApi.getConfig.mockResolvedValue({ ok: true, value: config });
    authApi.getMe.mockResolvedValue({ ok: true, value: user });
    await useSessionStore.getState().init();
    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().user).toEqual(user);
  });

  it("marks justLoggedIn and clears the prompt on a successful login", async () => {
    authApi.login.mockResolvedValue({ ok: true, value: user });
    const result = await useSessionStore.getState().login({ email: user.email, password: "password123" });
    expect(result.ok).toBe(true);
    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().justLoggedIn).toBe(true);
  });

  it("surfaces a blocked-account error without changing state", async () => {
    authApi.login.mockResolvedValue({ ok: false, error: { kind: "forbidden", message: "account_blocked" } });
    const result = await useSessionStore.getState().login({ email: user.email, password: "x" });
    expect(result.ok).toBe(false);
    expect(useSessionStore.getState().status).toBe("loading");
  });

  it("prompts re-login when a 401 arrives while authenticated", () => {
    useSessionStore.setState({ status: "authenticated", user });
    unauthorizedHandler?.();
    expect(useSessionStore.getState().status).toBe("guest");
    expect(useSessionStore.getState().loginPrompt).toBe("expired");
    expect(useSessionStore.getState().user).toBeNull();
  });

  it("ignores a 401 when not authenticated (guest probe / bad login)", () => {
    useSessionStore.setState({ status: "guest", user: null });
    unauthorizedHandler?.();
    expect(useSessionStore.getState().loginPrompt).toBeNull();
  });
});
