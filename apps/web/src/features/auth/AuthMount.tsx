// Composition root for the lazy login prompt. Mounted once from App.tsx; it
// renders the dialog only while `loginPrompt` is set, so guests never see it.

import { useSessionStore } from "@/core/state/sessionStore";
import LoginDialog from "@/features/auth/LoginDialog";

export default function AuthMount() {
  const loginPrompt = useSessionStore((s) => s.loginPrompt);
  const closeLoginPrompt = useSessionStore((s) => s.closeLoginPrompt);

  if (loginPrompt === null) return null;
  return <LoginDialog reason={loginPrompt} onClose={closeLoginPrompt} />;
}
