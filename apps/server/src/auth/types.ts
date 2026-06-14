// ============================================================================
// Auth shared types — provider contract + request context (#57)
// ============================================================================
// `AuthProvider` is the seam ADR 0014 calls for: each mode (local, OIDC)
// registers its own routes and declares what the frontend should render via
// `publicConfig()`. Everything past the session guard is mode-agnostic — the
// guard resolves a session to a `users` row and decorates the request.
// ============================================================================

import type { Clock } from "./clock";
import type { SessionService } from "./session";
import type { AppConfig } from "../config";
import type { Repository } from "../db/repository";
import type { UserRow } from "../db/schema";
import type { FastifyInstance } from "fastify";

/** The dependencies every provider and the guard share. */
export interface AuthContext {
  readonly config: AppConfig;
  readonly repo: Repository;
  readonly sessions: SessionService;
  readonly clock: Clock;
}

/** What `GET /auth/config` advertises per enabled mode. */
export type PublicAuthMode =
  | { readonly mode: "local"; readonly registrationEnabled: boolean }
  | { readonly mode: "oidc"; readonly loginUrl: string };

export interface AuthProvider {
  readonly id: "local" | "oidc";
  /** Describe this mode for the frontend. */
  publicConfig(): PublicAuthMode;
  /**
   * Mount this provider's routes. The instance is the app (routes are added at
   * `/auth/...`); providers apply `.withTypeProvider<ZodTypeProvider>()`
   * internally to get Zod-typed schemas.
   */
  registerRoutes(app: FastifyInstance): Promise<void> | void;
}

// The session guard decorates the request with the authenticated user.
declare module "fastify" {
  interface FastifyRequest {
    authUser?: UserRow;
  }
}
