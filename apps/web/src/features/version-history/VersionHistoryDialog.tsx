// ============================================================================
// VersionHistoryDialog — list committed snapshots, restore an old one (#62/#64)
// ============================================================================
// Minimal history surface for the open server project: every committed version
// newest-first. "Restore" loads version N back into the canvas; for an editor
// it also commits it as the new head (immutable history — ADR 0014). A viewer
// can load an old version locally but not write it back.
// ============================================================================

import { useEffect, useRef, useState } from "react";

import { useFocusTrap } from "@/core/a11y/useFocusTrap";
import { listVersions, restoreVersion } from "@/core/project/versionHistory";
import { notify } from "@/core/state/notificationStore";
import { useProjectContextStore } from "@/core/state/projectContextStore";

import type { SnapshotMeta } from "@/core/api/projects";

import "@/features/version-history/VersionHistoryDialog.css";

interface VersionHistoryDialogProps {
  readonly onClose: () => void;
}

export default function VersionHistoryDialog({ onClose }: VersionHistoryDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const server = useProjectContextStore((s) => s.server);
  const [snapshots, setSnapshots] = useState<readonly SnapshotMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyVersion, setBusyVersion] = useState<number | null>(null);

  useFocusTrap(panelRef);

  useEffect(() => {
    let alive = true;
    void listVersions().then((result) => {
      if (!alive) return;
      if (result.ok) setSnapshots(result.value);
      else setError(result.error);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const canEdit = server !== null && server.role !== "viewer";

  const restore = (version: number) => {
    setBusyVersion(version);
    void restoreVersion(version)
      .then((result) => {
        if (!result.ok) {
          notify({ level: "error", title: "Restore failed", detail: result.error });
          return;
        }
        notify({
          level: "success",
          title: "Restored",
          detail:
            result.value.kind === "restored-head"
              ? `Version ${String(version)} is the new head (v${String(result.value.version)}).`
              : `Loaded version ${String(version)}.`,
        });
        onClose();
      })
      .finally(() => {
        setBusyVersion(null);
      });
  };

  return (
    <>
      <div className="vhistory-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className="vhistory"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vhistory-title"
      >
        <header className="vhistory-head">
          <h2 id="vhistory-title" className="vhistory-title">
            Version history
          </h2>
          <button type="button" className="vhistory-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {error !== null ? (
          <p className="vhistory-empty" role="alert">
            {error}
          </p>
        ) : snapshots === null ? (
          <p className="vhistory-empty">Loading…</p>
        ) : snapshots.length === 0 ? (
          <p className="vhistory-empty">No versions committed yet.</p>
        ) : (
          <ul className="vhistory-list">
            {snapshots.map((s, i) => (
              <li key={s.version} className="vhistory-row">
                <span className="vhistory-version">
                  v{s.version}
                  {i === 0 ? <span className="vhistory-head-tag">head</span> : null}
                </span>
                <span className="vhistory-date">{new Date(s.createdAt).toLocaleString()}</span>
                <button
                  type="button"
                  className="vhistory-restore"
                  disabled={busyVersion !== null}
                  onClick={() => {
                    restore(s.version);
                  }}
                >
                  {busyVersion === s.version ? "…" : canEdit ? "Restore" : "Load"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
