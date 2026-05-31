// ============================================================================
// buildLayoutTree — resolved elements + containment → ELK layout forest
// ============================================================================
// Pure. Turns the flat list of visible elements (plus the per-element
// containment metadata from resolve()) into the nested LayoutNode tree the
// layout engine expects. Container nodes carry their children and a padding
// that reserves room for the header; leaf nodes carry fixed dimensions.
//
// Kept separate from useLayoutedGraph so it can be unit-tested without a
// worker or React.
// ============================================================================

import { CONTAINER_PADDING, NODE_DIMENSIONS } from "@/features/canvas/types";

import type { Containment } from "@/core/doc/resolve";
import type { LayoutNode } from "@/core/layout/LayoutEngine";
import type { Element } from "@/core/schema/schema";

/**
 * Build the forest of {@link LayoutNode}s for the given visible elements.
 *
 * `parentId` in the containment map defines the tree; elements whose
 * `parentId` is null (or absent) become roots. An element is rendered as a
 * container when its containment marks `hasVisibleChildren`.
 */
export function buildLayoutTree(
  elements: readonly Element[],
  containment: ReadonlyMap<string, Containment>,
): readonly LayoutNode[] {
  const childrenByParent = new Map<string, Element[]>();
  const roots: Element[] = [];

  for (const el of elements) {
    const parentId = containment.get(el.id)?.parentId ?? null;
    if (parentId === null) {
      roots.push(el);
    } else {
      const siblings = childrenByParent.get(parentId);
      if (siblings === undefined) childrenByParent.set(parentId, [el]);
      else siblings.push(el);
    }
  }

  const build = (el: Element): LayoutNode => {
    const isContainer = containment.get(el.id)?.hasVisibleChildren === true;
    const kids = childrenByParent.get(el.id);

    if (isContainer && kids !== undefined && kids.length > 0) {
      return {
        id: el.id,
        // Width/height are computed by ELK for containers; the values here are
        // only a floor and are ignored once children drive the size.
        width: NODE_DIMENSIONS.group.width,
        height: NODE_DIMENSIONS.group.height,
        padding: { ...CONTAINER_PADDING },
        children: kids.map(build),
      };
    }

    const dim = el.type === "group" ? NODE_DIMENSIONS.group : NODE_DIMENSIONS.default;
    return { id: el.id, width: dim.width, height: dim.height };
  };

  return roots.map(build);
}
