// ============================================================================
// PresenceBar — "who's here" avatars in the topbar (#66)
// ============================================================================
// Renders the other live participants (from the presence store) as colored
// initials, each carrying a viewer/editor indicator. Per-user color comes from
// the presence tokens via a CSS custom property — no raw color in JS.
// ============================================================================

import { usePresenceStore } from "@/core/state/presenceStore";
import { initialsOf } from "@/features/auth/initials";

import type { CSSProperties } from "react";

import "@/features/presence/PresenceBar.css";

const MAX_AVATARS = 5;

export default function PresenceBar() {
  const participants = usePresenceStore((s) => s.participants);
  if (participants.length === 0) return null;

  const shown = participants.slice(0, MAX_AVATARS);
  const overflow = participants.length - shown.length;

  return (
    <div className="presence-bar" aria-label={`${String(participants.length)} other people here`}>
      {shown.map((p) => (
        <span
          key={p.clientId}
          className="presence-avatar"
          // Color from the presence tokens — referenced, never authored, in JS.
          style={{ "--presence-color": `var(--color-presence-${String(p.colorIndex)})` } as CSSProperties}
          title={`${p.name} · ${p.role}`}
          data-role={p.role}
        >
          {initialsOf(p.name)}
          <span className="presence-role" aria-hidden>
            {p.role === "viewer" ? "👁" : "✎"}
          </span>
        </span>
      ))}
      {overflow > 0 ? <span className="presence-overflow">+{overflow}</span> : null}
    </div>
  );
}
