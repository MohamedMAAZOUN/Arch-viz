// ============================================================================
// sessionStore — who the user is, and whether we should prompt a login
// ============================================================================
// View-state tier (ADR 0010): the session is per-user UI state, never part of
// the document. Guest mode is the resting state — the app boots and edits with
// `status: "guest"` and zero auth (ADR 0014). A login is prompted lazily, at
// the save/share moment or when a live session expires mid-use; it is never a
// startup wall.
//
// The single `http` boundary reports every 401 here. We only treat it as a
// session expiry when we *were* authenticated — a 401 from the boot `GET
// /auth/me` (a guest) or from a failed login attempt is expected and silent.
// ============================================================================

import { create } from "zustand";

import { authApi, type AuthConfig, type LoginInput, type PublicUser, type RegisterInput } from "@/core/api/auth";
import { setUnauthorizedHandler, type ApiError } from "@/core/api/http";

/** Why the login dialog is open — drives its copy and post-login behaviour. */
export type LoginReason = "manual" | "save" | "share" | "expired";

export type SessionStatus = "loading" | "guest" | "authenticated";

export interface SessionState {
  status: SessionStatus;
  user: PublicUser | null;
  /** Advertised auth modes (local / oidc). Null until `init` resolves it. */
  config: AuthConfig | null;
  /** Open reason for the login dialog, or null when it is closed. */
  loginPrompt: LoginReason | null;
  /** Set true the first time a session is established, so #64 can offer a
   *  one-time local-draft import. */
  justLoggedIn: boolean;

  /** Boot: load the advertised config and resolve the current user (if any). */
  init: () => Promise<void>;
  login: (input: LoginInput) => Promise<{ ok: true } | { ok: false; error: ApiError }>;
  register: (input: RegisterInput) => Promise<{ ok: true } | { ok: false; error: ApiError }>;
  logout: () => Promise<void>;
  openLoginPrompt: (reason: LoginReason) => void;
  closeLoginPrompt: () => void;
  clearJustLoggedIn: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: "loading",
  user: null,
  config: null,
  loginPrompt: null,
  justLoggedIn: false,

  async init() {
    const [config, me] = await Promise.all([authApi.getConfig(), authApi.getMe()]);
    set({
      config: config.ok ? config.value : null,
      ...(me.ok
        ? { status: "authenticated" as const, user: me.value }
        : { status: "guest" as const, user: null }),
    });
  },

  async login(input) {
    const result = await authApi.login(input);
    if (!result.ok) return result;
    set({ status: "authenticated", user: result.value, loginPrompt: null, justLoggedIn: true });
    return { ok: true };
  },

  async register(input) {
    const result = await authApi.register(input);
    if (!result.ok) return result;
    set({ status: "authenticated", user: result.value, loginPrompt: null, justLoggedIn: true });
    return { ok: true };
  },

  async logout() {
    await authApi.logout();
    // Back to guest mode — the local draft (Y.Doc + IndexedDB) is untouched.
    set({ status: "guest", user: null, loginPrompt: null });
  },

  openLoginPrompt(reason) {
    set({ loginPrompt: reason });
  },
  closeLoginPrompt() {
    set({ loginPrompt: null });
  },
  clearJustLoggedIn() {
    set({ justLoggedIn: false });
  },
}));

// A 401 only means "session expired" if we currently believe we are signed in.
// A guest boot probe or a bad-password login attempt also 401s — those are
// handled by their own Result and must not pop the expiry dialog.
setUnauthorizedHandler(() => {
  const { status } = useSessionStore.getState();
  if (status === "authenticated") {
    useSessionStore.setState({ status: "guest", user: null, loginPrompt: "expired" });
  }
});
