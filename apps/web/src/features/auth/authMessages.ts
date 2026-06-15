// Human-readable copy for auth failures. The server speaks in stable error
// codes (account_blocked, invalid_credentials, …); this is the single place
// they become sentences, so a `blocked` account reads distinctly (issue #63).

import type { ApiError } from "@/core/api/http";

export function describeAuthError(error: ApiError): string {
  if (error.kind === "network") return "Can't reach the server. Check your connection and try again.";
  switch (error.message) {
    case "account_blocked":
      return "This account has been blocked. Contact an administrator to restore access.";
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_taken":
      return "An account with that email already exists. Try signing in instead.";
    case "name_required":
      return "Please give the project a name.";
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}
