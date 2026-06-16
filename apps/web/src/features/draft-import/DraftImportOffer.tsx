// ============================================================================
// DraftImportOffer — one-time "save your local draft to the server" prompt
// ============================================================================
// Shown once, just after the first successful login (issue #64): a guest may
// have built a draft locally (Y.Doc + IndexedDB) before signing in. We offer to
// import it as a new server project so it stops being browser-local. The offer
// is one-time (persisted) and only appears for a local-only document — never
// when a server project is already open.
// ============================================================================

import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { importDraftAsProject } from "@/core/project/saveProject";
import { notify } from "@/core/state/notificationStore";
import { useProjectContextStore } from "@/core/state/projectContextStore";
import { useSessionStore } from "@/core/state/sessionStore";

import "@/features/draft-import/DraftImportOffer.css";

const OFFERED_KEY = "arch-vis:draft-import-offered";

function alreadyOffered(): boolean {
  try {
    return localStorage.getItem(OFFERED_KEY) === "1";
  } catch {
    return false;
  }
}

function markOffered(): void {
  try {
    localStorage.setItem(OFFERED_KEY, "1");
  } catch {
    // Private mode / storage disabled — at worst the offer re-appears later.
  }
}

export default function DraftImportOffer() {
  const justLoggedIn = useSessionStore((s) => s.justLoggedIn);
  const clearJustLoggedIn = useSessionStore((s) => s.clearJustLoggedIn);
  const server = useProjectContextStore((s) => s.server);
  const doc = useDocSnapshot();

  const visible = justLoggedIn && server === null && doc !== null && !alreadyOffered();
  if (!visible) return null;

  const dismiss = () => {
    markOffered();
    clearJustLoggedIn();
  };

  const accept = () => {
    markOffered();
    clearJustLoggedIn();
    void importDraftAsProject().then((outcome) => {
      if (outcome.kind === "created") {
        notify({
          level: "success",
          title: "Draft saved",
          detail: "Your local draft is now a server project.",
        });
      } else if (outcome.kind === "error") {
        notify({ level: "error", title: "Couldn't save draft", detail: outcome.message });
      }
    });
  };

  return (
    <div className="draft-offer" role="dialog" aria-label="Save your local draft">
      <p className="draft-offer-text">
        Save your local draft “{doc.project.name}” to the server as a new project?
      </p>
      <div className="draft-offer-actions">
        <button type="button" className="draft-offer-dismiss" onClick={dismiss}>
          Not now
        </button>
        <button type="button" className="draft-offer-accept" onClick={accept}>
          Save to server
        </button>
      </div>
    </div>
  );
}
