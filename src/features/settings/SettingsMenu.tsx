// ============================================================================
// SettingsMenu — the settings panel that houses theme/brand preferences
// ============================================================================
// Opens from the TopBar's settings button. Anchored to the right side of
// the viewport as a slide-in panel. Closes on Esc, on scrim click, or via
// the X button.
// ============================================================================

import { useEffect, useRef, useState } from "react";

import { useFocusTrap } from "@/core/a11y/useFocusTrap";
import { getPreferences, onChange, setPreferences } from "@/design-system/theme";

import type { Brand, Theme } from "@/design-system/theme";

import "@/features/settings/SettingsMenu.css";

interface SettingsMenuProps {
  onClose: () => void;
}

export default function SettingsMenu({ onClose }: SettingsMenuProps) {
  const [prefs, setPrefs] = useState(getPreferences);
  const panelRef = useRef<HTMLElement>(null);

  // Trap focus inside the dialog while it's open; restore it to the opener
  // (the settings button) on close. See issue #29.
  useFocusTrap(panelRef);

  // Sync to external changes (theme.ts fires events on setPreferences)
  useEffect(() => {
    return onChange(setPrefs);
  }, []);

  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleBrand = (brand: Brand) => {
    setPreferences({ brand });
  };

  const handleTheme = (theme: Theme | "system") => {
    setPreferences({ theme });
  };

  return (
    <>
      <div className="settings-scrim" onClick={onClose} aria-hidden />
      <aside
        ref={panelRef}
        className="settings-panel"
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
      >
        <header className="settings-header">
          <div>
            <span className="settings-eyebrow">preferences</span>
            <h2 className="settings-title">Settings</h2>
          </div>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </header>

        <section className="settings-section">
          <h3 className="settings-section-title">Brand</h3>
          <p className="settings-section-desc">Pick the visual identity used across the app.</p>
          <div className="settings-segment">
            <SegmentButton
              active={prefs.brand === "neon"}
              onClick={() => {
                handleBrand("neon");
              }}
            >
              <span className="settings-swatch settings-swatch--neon" />
              Neon
            </SegmentButton>
            <SegmentButton
              active={prefs.brand === "michelin"}
              onClick={() => {
                handleBrand("michelin");
              }}
            >
              <span className="settings-swatch settings-swatch--michelin" />
              Michelin
            </SegmentButton>
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Theme</h3>
          <p className="settings-section-desc">Auto follows your operating system preference.</p>
          <div className="settings-segment">
            <SegmentButton
              active={prefs.theme === "system"}
              onClick={() => {
                handleTheme("system");
              }}
            >
              Auto
            </SegmentButton>
            <SegmentButton
              active={prefs.theme === "dark"}
              onClick={() => {
                handleTheme("dark");
              }}
            >
              Dark
            </SegmentButton>
            <SegmentButton
              active={prefs.theme === "light"}
              onClick={() => {
                handleTheme("light");
              }}
            >
              Light
            </SegmentButton>
          </div>
        </section>

        <footer className="settings-footer">
          <span className="settings-version">arch-vis v0.1.0 · design system v1.0.0</span>
        </footer>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// SegmentButton — local primitive for the settings segmented controls
// ---------------------------------------------------------------------------

interface SegmentButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function SegmentButton({ active, onClick, children }: SegmentButtonProps) {
  return (
    <button type="button" className="settings-seg-btn" data-active={active} onClick={onClick}>
      {children}
    </button>
  );
}
