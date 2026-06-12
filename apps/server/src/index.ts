// ============================================================================
// @arch-vis/server — placeholder
// ============================================================================
// The backend is designed in ADR 0014 (docs/adr/0014-backend.md) and built
// incrementally by issues #55+ (Fastify scaffold, DB schema, auth, catalog,
// multiplayer). This file only proves the workspace wiring: the server
// consumes the same schema contract as the web app.
// ============================================================================

import type { ProjectDocument } from "@arch-vis/schema";

export type { ProjectDocument };
