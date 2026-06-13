// ============================================================================
// elementDependents — what a `removeElement` would cascade to
// ============================================================================
// Pure helper shared by the delete affordances (inspector button + keyboard
// shortcut) so both describe the blast radius the same way. Mirrors the cascade
// rule in DocStore.removeElement: the whole descendant subtree, plus every
// connection touching the element or any of its descendants.
// ============================================================================

import type { ProjectDocument } from "@arch-vis/schema";

export interface ElementDependents {
  /** Number of descendant elements that would also be removed. */
  descendants: number;
  /** Number of connections that would be removed (touching any removed element). */
  connections: number;
}

export function countElementDependents(doc: ProjectDocument, elementId: string): ElementDependents {
  if (!doc.elements.some((e) => e.id === elementId)) {
    return { descendants: 0, connections: 0 };
  }

  const childrenOf = new Map<string, string[]>();
  for (const el of doc.elements) {
    if (el.parent === undefined) continue;
    const siblings = childrenOf.get(el.parent) ?? [];
    siblings.push(el.id);
    childrenOf.set(el.parent, siblings);
  }

  const removed = new Set<string>([elementId]);
  const queue = [elementId];
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    for (const child of childrenOf.get(next) ?? []) {
      if (!removed.has(child)) {
        removed.add(child);
        queue.push(child);
      }
    }
  }

  const connections = doc.connections.filter(
    (c) => removed.has(c.from) || removed.has(c.to),
  ).length;

  return { descendants: removed.size - 1, connections };
}
