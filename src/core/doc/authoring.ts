// ============================================================================
// authoring — build minimal, valid new elements and connections
// ============================================================================
// Pure factories used when the UI creates elements/connections from scratch
// (the "add element" palette and drag-to-connect). They produce schema-shaped
// objects with a fresh unique id and a sensible lifecycle so the result passes
// validation and is visible at the view it was authored in. Mutation/persistence
// is the caller's job (docStore.addElement / addConnection).
// ============================================================================

import { createUniqueId } from "@/lib/id";

import type {
  Connection,
  ConnectionType,
  Element,
  ElementType,
  LayerId,
  MvpRef,
} from "@/core/schema/schema";

export function buildElement(options: {
  type: ElementType;
  takenIds: ReadonlySet<string>;
  introducedIn: MvpRef;
  /** Lowest layer the element is visible at. Defaults to "business" so a new
   *  element shows immediately regardless of the current layer. */
  minLayer?: LayerId;
  name?: string;
}): Element {
  const { type, takenIds, introducedIn, minLayer = "business", name } = options;
  const common = {
    id: createUniqueId(type, takenIds),
    name: name ?? `New ${type}`,
    minLayer,
    properties: {},
    lifecycle: { introducedIn },
  };
  // The discriminated union needs the literal `type` on each member; `group`
  // carries the extra aggregateAt field.
  return type === "group" ? { type, aggregateAt: [], ...common } : { type, ...common };
}

export function buildConnection(options: {
  from: string;
  to: string;
  takenIds: ReadonlySet<string>;
  introducedIn: MvpRef;
  /** Lowest layer the connection is visible at. Defaults to the layer it was
   *  drawn on so it appears immediately. */
  minLayer: LayerId;
  type?: ConnectionType;
}): Connection {
  const { from, to, takenIds, introducedIn, minLayer, type = "sync" } = options;
  return {
    id: createUniqueId("conn", takenIds),
    from,
    to,
    type,
    minLayer,
    lifecycle: { introducedIn },
  };
}
