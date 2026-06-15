// ============================================================================
// UserChip — the topbar identity affordance
// ============================================================================
// Guest: a quiet "Sign in" button (opens the lazy prompt). Authenticated: an
// avatar (initials) + name that opens a small menu with the email and sign-out.
// This is the only always-visible auth surface; everything else is on demand.
// ============================================================================

import { useEffect, useRef, useState } from "react";

import { useSessionStore } from "@/core/state/sessionStore";
import { initialsOf } from "@/features/auth/initials";

import "@/features/auth/UserChip.css";

export default function UserChip() {
  const status = useSessionStore((s) => s.status);
  const user = useSessionStore((s) => s.user);
  const openLoginPrompt = useSessionStore((s) => s.openLoginPrompt);
  const logout = useSessionStore((s) => s.logout);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen]);

  if (status === "loading") {
    return <div className="userchip-skeleton" aria-hidden />;
  }

  if (status === "guest" || user === null) {
    return (
      <button
        type="button"
        className="userchip-signin"
        onClick={() => {
          openLoginPrompt("manual");
        }}
      >
        Sign in
      </button>
    );
  }

  return (
    <div ref={rootRef} className="userchip-root">
      <button
        type="button"
        className="userchip-btn"
        onClick={() => {
          setMenuOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={user.email}
      >
        <span className="userchip-avatar" aria-hidden>
          {initialsOf(user.displayName)}
        </span>
        <span className="userchip-name">{user.displayName}</span>
      </button>

      {menuOpen ? (
        <div className="userchip-menu" role="menu">
          <div className="userchip-menu-head">
            <span className="userchip-menu-name">{user.displayName}</span>
            <span className="userchip-menu-email">{user.email}</span>
          </div>
          <button
            type="button"
            className="userchip-menu-item"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              void logout();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
