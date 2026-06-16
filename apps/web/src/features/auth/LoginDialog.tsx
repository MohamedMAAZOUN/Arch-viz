// ============================================================================
// LoginDialog — the lazy login prompt (guest mode preserved)
// ============================================================================
// Rendered ONLY when something asks for it (save/share moment, or a session
// that expired mid-use) — never at startup. It shapes itself to GET /auth/config
// (apps/server): an email/password form for local mode, a "Sign in with SSO"
// button for OIDC, or both. The local draft (Y.Doc + IndexedDB) is never
// touched here, so re-authenticating after an expiry loses nothing.
// ============================================================================

import { useRef, useState } from "react";

import { useFocusTrap } from "@/core/a11y/useFocusTrap";
import { useSessionStore, type LoginReason } from "@/core/state/sessionStore";
import { describeAuthError } from "@/features/auth/authMessages";

import "@/features/auth/LoginDialog.css";

const REASON_COPY: Record<LoginReason, { title: string; blurb: string }> = {
  manual: { title: "Sign in", blurb: "Sign in to save and share projects on the server." },
  save: {
    title: "Sign in to save",
    blurb: "Saving to the server needs an account. Your local draft is safe either way.",
  },
  share: { title: "Sign in to share", blurb: "Sharing a project with others needs an account." },
  expired: {
    title: "Session expired",
    blurb: "Your session timed out. Sign in again — your unsaved work is still here.",
  },
};

interface LoginDialogProps {
  readonly reason: LoginReason;
  readonly onClose: () => void;
}

export default function LoginDialog({ reason, onClose }: LoginDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const config = useSessionStore((s) => s.config);
  const login = useSessionStore((s) => s.login);
  const register = useSessionStore((s) => s.register);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusTrap(panelRef);

  const local = config?.modes.find(
    (m): m is { mode: "local"; registrationEnabled: boolean } => m.mode === "local",
  );
  const oidc = config?.modes.find(
    (m): m is { mode: "oidc"; loginUrl: string } => m.mode === "oidc",
  );
  const copy = REASON_COPY[reason];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const action =
      mode === "register"
        ? register({
            email,
            password,
            ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
          })
        : login({ email, password });
    void action
      .then((result) => {
        if (!result.ok) setError(describeAuthError(result.error));
        // On success the store closes the prompt; this component unmounts.
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <>
      <div className="login-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className="login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
      >
        <header className="login-head">
          <h2 id="login-title" className="login-title">
            {copy.title}
          </h2>
          <button type="button" className="login-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <p className="login-blurb">{copy.blurb}</p>

        {config === null ? (
          <p className="login-error" role="alert">
            Sign-in is unavailable — the server can't be reached. You can keep working as a guest.
          </p>
        ) : (
          <>
            {local !== undefined ? (
              <form className="login-form" onSubmit={submit}>
                {mode === "register" ? (
                  <label className="login-field">
                    <span className="login-label">Display name (optional)</span>
                    <input
                      className="login-input"
                      type="text"
                      value={displayName}
                      autoComplete="name"
                      onChange={(e) => {
                        setDisplayName(e.target.value);
                      }}
                    />
                  </label>
                ) : null}
                <label className="login-field">
                  <span className="login-label">Email</span>
                  <input
                    className="login-input"
                    type="email"
                    required
                    value={email}
                    autoComplete="email"
                    autoFocus
                    onChange={(e) => {
                      setEmail(e.target.value);
                    }}
                  />
                </label>
                <label className="login-field">
                  <span className="login-label">Password</span>
                  <input
                    className="login-input"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    onChange={(e) => {
                      setPassword(e.target.value);
                    }}
                  />
                </label>

                {error !== null ? (
                  <p className="login-error" role="alert">
                    {error}
                  </p>
                ) : null}

                <button type="submit" className="login-submit" disabled={busy}>
                  {busy ? "…" : mode === "register" ? "Create account" : "Sign in"}
                </button>

                {local.registrationEnabled ? (
                  <button
                    type="button"
                    className="login-switch"
                    onClick={() => {
                      setMode((m) => (m === "login" ? "register" : "login"));
                      setError(null);
                    }}
                  >
                    {mode === "login" ? "Create an account" : "I already have an account"}
                  </button>
                ) : null}
              </form>
            ) : null}

            {local !== undefined && oidc !== undefined ? (
              <div className="login-divider">
                <span>or</span>
              </div>
            ) : null}

            {oidc !== undefined ? (
              <a className="login-sso" href={oidc.loginUrl}>
                Sign in with SSO
              </a>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
