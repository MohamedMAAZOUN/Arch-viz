// Build the shared AuthContext: the session service (wired to the repository
// and a clock) plus the config and repo every provider/guard needs.

import { systemClock } from "./clock";
import { createSessionService } from "./session";

import type { Clock } from "./clock";
import type { AuthContext } from "./types";
import type { AppConfig } from "../config";
import type { Repository } from "../db/repository";

export function createAuthContext(
  config: AppConfig,
  repo: Repository,
  clock: Clock = systemClock,
): AuthContext {
  const sessions = createSessionService({
    sessions: repo.sessions,
    config: {
      idleTtlMs: config.session.idleTtlMs,
      absoluteTtlMs: config.session.absoluteTtlMs,
      rotationIntervalMs: config.session.rotationIntervalMs,
    },
    clock,
  });
  return { config, repo, sessions, clock };
}
