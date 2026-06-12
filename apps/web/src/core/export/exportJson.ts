// ============================================================================
// exportJson — serialize the committed document for download
// ============================================================================
// Pure. The output round-trips: feeding it back through parseProjectJson
// yields an equivalent document. We pretty-print (2-space) so a downloaded
// file is human-diffable.
// ============================================================================

import type { ProjectDocument } from "@arch-vis/schema";

export function serializeProject(doc: ProjectDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** A filesystem-friendly base name for an export, e.g. "aurora-platform". */
export function exportBaseName(doc: ProjectDocument): string {
  return doc.project.id;
}
