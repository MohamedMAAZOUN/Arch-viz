// ============================================================================
// DocStore — the single source of truth for the draft project document
// ============================================================================
// Principle 1 + 2 from the engineering guide:
//   - Y.Doc is the source of truth for the draft.
//   - This is the ONLY file in the codebase that imports yjs.
//
// Application code calls the operations exposed here. It never reaches into
// the underlying Y.Doc. Undo/redo, IndexedDB persistence, and (in v2)
// multiplayer all hang off this store with zero further app-code changes.
//
// Mutation philosophy
// -------------------
// Every mutation:
//   1. Reads the current doc as a plain snapshot,
//   2. Computes a NEW snapshot with the change applied (no in-place mutation),
//   3. Writes the new snapshot inside a single yDoc.transact().
//
// This pattern lets Y.UndoManager capture each user action as one undo step,
// and keeps the doc-shape transition (v1 single-key → v2 finer-grained Y types)
// invisible to consumers.
// ============================================================================

import * as Y from "yjs";

import { assertNever } from "@/core/errors";

import type {
  Annotation,
  Connection,
  ConnectionType,
  Element,
  LayerId,
  ProjectDocument,
} from "@arch-vis/schema";

/**
 * The connection fields the inspector is allowed to edit, modelled as a
 * discriminated union so each field carries exactly the value type it accepts.
 * Replaces the old loose `(key: string, value: unknown)` surface — widening
 * this set is now a deliberate, type-checked decision rather than an accident.
 */
export type ConnectionEdit =
  | { readonly field: "type"; readonly value: ConnectionType }
  /** `null` (or blank) clears the optional protocol back to unset. */
  | { readonly field: "protocol"; readonly value: string | null };

const DOC_KEY = "document";

export type DocChangeHandler = (snapshot: ProjectDocument) => void;

export interface DocStore {
  // -- Lifecycle ---------------------------------------------------------
  load(doc: ProjectDocument): void;
  get(): ProjectDocument | null;
  subscribe(handler: DocChangeHandler): () => void;

  commit(): void;
  discard(): void;
  dirty(): boolean;

  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;

  // -- Mutations ---------------------------------------------------------
  /** Set a manual layout override for an element at a specific layer.
   *  Passing null clears the override (element returns to auto-layout). */
  setElementLayoutOverride(
    layer: LayerId,
    elementId: string,
    position: { x: number; y: number } | null,
  ): void;

  /** Clear all manual position overrides for a layer (the "reorganize" action). */
  clearLayerOverrides(layer: LayerId): void;

  /** Update a single property on an element. Use null to remove the property. */
  updateElementProperty(elementId: string, key: string, value: unknown): void;

  /** Update a property at a nested path (e.g. ["tech", "language"]).
   *  Creates intermediate objects as needed. Use null to remove the leaf. */
  updateElementPropertyPath(elementId: string, path: readonly string[], value: unknown): void;

  /** Update an element's name. */
  updateElementName(elementId: string, name: string): void;

  /** Replace an element's markdown documentation. Pass null to clear it. */
  updateElementDocumentation(elementId: string, markdown: string | null): void;

  /** Append a freeform note to an element. The caller builds the full
   *  {@link Annotation} (id + timestamp) so this stays a pure structural edit. */
  addAnnotation(elementId: string, annotation: Annotation): void;

  /** Remove a single annotation from an element by its id. */
  removeAnnotation(elementId: string, annotationId: string): void;

  /** Edit one of the known-editable fields on a connection. The {@link
   *  ConnectionEdit} union keeps the value type tied to the field being set. */
  updateConnectionProperty(connectionId: string, edit: ConnectionEdit): void;

  // -- Structural mutations (add / remove elements and connections) ------
  /** Append a new, fully-formed element. The caller is responsible for a
   *  unique id and a valid lifecycle (use the element-editor helpers). */
  addElement(element: Element): void;

  /** Remove an element and everything that depends on it: its entire descendant
   *  subtree, every connection touching any removed element, and all per-layer
   *  layout overrides for the removed ids. One atomic step (one undo). */
  removeElement(elementId: string): void;

  /** Append a new connection between two existing elements. */
  addConnection(connection: Connection): void;

  /** Remove a connection by id. */
  removeConnection(connectionId: string): void;

  // -- Diagnostics -------------------------------------------------------
  __internal: {
    yDoc: Y.Doc;
  };
}

// ----------------------------------------------------------------------------
// Implementation
// ----------------------------------------------------------------------------

export function createDocStore(): DocStore {
  const yDoc = new Y.Doc();
  const yRoot = yDoc.getMap<unknown>("root");

  const undoManager = new Y.UndoManager(yRoot, {
    // Mutations within 400ms of each other are merged into one undo step.
    // This is what makes "typing into a field" undo as a single action rather
    // than per-keystroke. The trade-off: tests that fire multiple mutations
    // in synchronous code see them all in one undo step too.
    captureTimeout: 400,
  });

  let committedSnapshot: ProjectDocument | null = null;
  // Cached draft-vs-committed answer. `null` means "stale — recompute on the
  // next dirty() call". The doc only changes on mutate / undo / redo / load /
  // commit / discard, so we recompute at most once per change instead of on
  // every dirty() call (which the topbar/save flow polls). See dirty() below.
  let dirtyCache: boolean | null = null;
  const handlers = new Set<DocChangeHandler>();

  function readDoc(): ProjectDocument | null {
    const value = yRoot.get(DOC_KEY) as ProjectDocument | undefined;
    return value ?? null;
  }

  /**
   * Apply a pure transformation to the doc inside a transaction.
   * Returns true if the doc actually changed.
   */
  function mutate(transform: (doc: ProjectDocument) => ProjectDocument): boolean {
    const current = readDoc();
    if (current === null) return false;
    const next = transform(current);
    if (next === current) return false; // no-op
    yDoc.transact(() => {
      yRoot.set(DOC_KEY, next);
    });
    return true;
  }

  function notify(): void {
    // Any observed change (mutate, undo, redo, load, discard) can flip the
    // dirty answer — invalidate the cache so the next dirty() recomputes.
    dirtyCache = null;
    const snapshot = readDoc();
    if (snapshot === null) return;
    for (const handler of handlers) {
      handler(snapshot);
    }
  }

  yRoot.observeDeep(notify);

  return {
    // -- Lifecycle -------------------------------------------------------

    load(doc) {
      yDoc.transact(() => {
        yRoot.set(DOC_KEY, doc);
      });
      committedSnapshot = doc;
      dirtyCache = false; // freshly loaded == committed
      undoManager.clear();
    },

    get() {
      return readDoc();
    },

    subscribe(handler) {
      handlers.add(handler);
      const snapshot = readDoc();
      if (snapshot !== null) handler(snapshot);
      return () => {
        handlers.delete(handler);
      };
    },

    commit() {
      const current = readDoc();
      if (current === null) return;
      committedSnapshot = current;
      dirtyCache = false; // current is now the committed baseline
    },

    discard() {
      if (committedSnapshot === null) return;
      yDoc.transact(() => {
        yRoot.set(DOC_KEY, committedSnapshot);
      });
      // notify() ran inside the transact and set the cache stale; the doc now
      // equals the committed snapshot again, so it's clean.
      dirtyCache = false;
      undoManager.clear();
    },

    dirty() {
      // O(1) while the doc is unchanged; recomputes only after a doc change
      // invalidates the cache. The comparison short-circuits on the first
      // difference and is key-order insensitive (structural, not stringified).
      if (dirtyCache === null) {
        dirtyCache = !jsonEqual(readDoc(), committedSnapshot);
      }
      return dirtyCache;
    },

    undo() {
      undoManager.undo();
    },
    redo() {
      undoManager.redo();
    },
    canUndo() {
      return undoManager.canUndo();
    },
    canRedo() {
      return undoManager.canRedo();
    },

    // -- Mutations -------------------------------------------------------

    setElementLayoutOverride(layer, elementId, position) {
      mutate((doc) => {
        const existingLayout = doc.layout ?? {};
        const existingForLayer = existingLayout[layer] ?? {};

        const nextForLayer =
          position === null
            ? omitKey(existingForLayer, elementId)
            : { ...existingForLayer, [elementId]: { position } };

        // Drop empty per-layer maps so the doc stays minimal.
        const nextLayout =
          Object.keys(nextForLayer).length === 0
            ? omitKey(existingLayout, layer)
            : { ...existingLayout, [layer]: nextForLayer };

        return { ...doc, layout: nextLayout };
      });
    },

    clearLayerOverrides(layer) {
      mutate((doc) => {
        if (doc.layout?.[layer] === undefined) return doc;
        return { ...doc, layout: omitKey(doc.layout, layer) };
      });
    },

    updateElementProperty(elementId, key, value) {
      mutate((doc) => {
        const elements = doc.elements.map((el): Element => {
          if (el.id !== elementId) return el;
          const properties =
            value === null ? omitKey(el.properties, key) : { ...el.properties, [key]: value };
          return { ...el, properties };
        });
        return { ...doc, elements };
      });
    },

    updateElementPropertyPath(elementId, path, value) {
      if (path.length === 0) return;
      mutate((doc) => {
        const elements = doc.elements.map((el): Element => {
          if (el.id !== elementId) return el;
          const properties = setPath(el.properties as Record<string, unknown>, path, value);
          return { ...el, properties };
        });
        return { ...doc, elements };
      });
    },

    updateElementName(elementId, name) {
      mutate((doc) => {
        const elements = doc.elements.map((el): Element => {
          if (el.id !== elementId) return el;
          return { ...el, name };
        });
        return { ...doc, elements };
      });
    },

    updateElementDocumentation(elementId, markdown) {
      mutate((doc) => {
        const elements = doc.elements.map((el): Element => {
          if (el.id !== elementId) return el;
          if (markdown === null) {
            const { documentation: _omit, ...rest } = el;
            return rest;
          }
          return { ...el, documentation: markdown };
        });
        return { ...doc, elements };
      });
    },

    addAnnotation(elementId, annotation) {
      mutate((doc) => {
        const elements = doc.elements.map((el): Element => {
          if (el.id !== elementId) return el;
          return { ...el, annotations: [...(el.annotations ?? []), annotation] };
        });
        return { ...doc, elements };
      });
    },

    removeAnnotation(elementId, annotationId) {
      mutate((doc) => {
        const elements = doc.elements.map((el): Element => {
          if (el.id !== elementId || el.annotations === undefined) return el;
          const remaining = el.annotations.filter((a) => a.id !== annotationId);
          if (remaining.length === el.annotations.length) return el; // not found
          if (remaining.length === 0) {
            const { annotations: _omit, ...rest } = el;
            return rest;
          }
          return { ...el, annotations: remaining };
        });
        return { ...doc, elements };
      });
    },

    updateConnectionProperty(connectionId, edit) {
      mutate((doc) => {
        const connections = doc.connections.map((c): Connection => {
          if (c.id !== connectionId) return c;
          switch (edit.field) {
            case "type":
              return { ...c, type: edit.value };
            case "protocol":
              // Blank or null clears the optional protocol; otherwise set it.
              return edit.value === null || edit.value.trim() === ""
                ? omitKey(c, "protocol")
                : { ...c, protocol: edit.value };
            default:
              return assertNever(edit);
          }
        });
        return { ...doc, connections };
      });
    },

    addElement(element) {
      mutate((doc) => {
        if (doc.elements.some((e) => e.id === element.id)) {
          // Invariant: ids are unique. The element-editor builds a fresh id; a
          // collision here is a programming error, so fail loudly per the guide.
          throw new Error(`addElement: duplicate element id ${element.id}`);
        }
        return { ...doc, elements: [...doc.elements, element] };
      });
    },

    removeElement(elementId) {
      mutate((doc) => {
        const removed = collectSubtree(elementId, doc.elements);
        if (removed.size === 0) return doc; // unknown id — no-op

        const elements = doc.elements.filter((e) => !removed.has(e.id));
        // Drop any connection touching a removed element.
        const connections = doc.connections.filter(
          (c) => !removed.has(c.from) && !removed.has(c.to),
        );
        // Drop layout overrides for removed elements across every layer.
        const layout = pruneLayoutForIds(doc.layout, removed);
        const base = { ...doc, elements, connections };
        return layout === undefined ? omitKey(base, "layout") : { ...base, layout };
      });
    },

    addConnection(connection) {
      mutate((doc) => {
        if (doc.connections.some((c) => c.id === connection.id)) {
          throw new Error(`addConnection: duplicate connection id ${connection.id}`);
        }
        return { ...doc, connections: [...doc.connections, connection] };
      });
    },

    removeConnection(connectionId) {
      mutate((doc) => {
        const connections = doc.connections.filter((c) => c.id !== connectionId);
        if (connections.length === doc.connections.length) return doc; // not found
        return { ...doc, connections };
      });
    },

    __internal: {
      yDoc,
    },
  };
}

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------

/**
 * Structural deep-equality for the JSON-shaped project document.
 *
 * Replaces the previous `stableStringify`-and-compare approach (issue #12).
 * Two wins over stringifying both sides on every call:
 *   - **Short-circuits** on the first difference — the common "is it dirty?"
 *     case returns the moment any field diverges, instead of serialising the
 *     whole document first.
 *   - **Key-order insensitive** by construction — it compares values by key,
 *     so a document rebuilt via object spreads never reads as falsely dirty.
 *
 * Only JSON values appear in the document (objects, arrays, primitives), so we
 * don't handle Dates/Maps/etc. Object keys whose value is `undefined` are
 * treated as absent to match JSON semantics (`JSON.stringify` drops them).
 */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;

  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!jsonEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = definedKeys(ao);
  const bKeys = definedKeys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!jsonEqual(ao[key], bo[key])) return false;
  }
  return true;
}

/** Keys of `obj` whose value is not `undefined` (mirrors JSON's omit rule). */
function definedKeys(obj: Record<string, unknown>): readonly string[] {
  return Object.keys(obj).filter((k) => obj[k] !== undefined);
}

/**
 * Collect an element and every descendant beneath it (any depth), so removing
 * a container also removes the children it would otherwise orphan (which would
 * make the document fail schema validation on its next parse). Returns an empty
 * set when the id is unknown.
 */
function collectSubtree(rootId: string, elements: readonly Element[]): ReadonlySet<string> {
  if (!elements.some((e) => e.id === rootId)) return new Set();

  // Build a parent → children adjacency map once, then BFS from the root.
  const childrenOf = new Map<string, string[]>();
  for (const el of elements) {
    if (el.parent === undefined) continue;
    const siblings = childrenOf.get(el.parent) ?? [];
    siblings.push(el.id);
    childrenOf.set(el.parent, siblings);
  }

  const removed = new Set<string>([rootId]);
  const queue = [rootId];
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
  return removed;
}

/**
 * Return a new per-layer layout with every entry for a removed element id
 * stripped, pruning emptied layers. Returns undefined when nothing remains (so
 * the caller can drop the `layout` key entirely and keep the doc minimal).
 */
function pruneLayoutForIds(
  layout: ProjectDocument["layout"],
  removed: ReadonlySet<string>,
): ProjectDocument["layout"] {
  if (layout === undefined) return undefined;

  const next: Record<string, Record<string, unknown>> = {};
  for (const [layer, perLayer] of Object.entries(layout)) {
    if (perLayer === undefined) continue;
    const kept: Record<string, unknown> = {};
    for (const [id, entry] of Object.entries(perLayer)) {
      if (!removed.has(id)) kept[id] = entry;
    }
    if (Object.keys(kept).length > 0) next[layer] = kept;
  }

  // Cast: we rebuilt the same shape the schema defines, minus removed ids.
  return Object.keys(next).length === 0 ? undefined : (next as ProjectDocument["layout"]);
}

/** Return a shallow copy of `obj` without the given key. Functional alternative
 *  to `delete`, which the codebase forbids via @typescript-eslint/no-dynamic-delete. */
function omitKey<T extends Record<string, unknown>>(obj: T, key: string): T {
  const next: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (k !== key) next[k] = obj[k];
  }
  return next as T;
}

/**
 * Set a value at a nested path in a plain-object tree, returning a new tree.
 * Creates intermediate objects as needed. Passing `null` as the value removes
 * the leaf (and recursively prunes objects left empty).
 *
 * Examples:
 *   setPath({},                   ["tech", "language"], "Rust")
 *     → { tech: { language: "Rust" } }
 *   setPath({ tech: { language: "Rust", runtime: "tokio" } }, ["tech", "language"], null)
 *     → { tech: { runtime: "tokio" } }
 *   setPath({ tech: { language: "Rust" } }, ["tech", "language"], null)
 *     → {}                                       (parent pruned when empty)
 */
function setPath(
  obj: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  if (head === undefined) return obj;

  if (rest.length === 0) {
    if (value === null) {
      return omitKey(obj, head);
    }
    return { ...obj, [head]: value };
  }

  const existing = obj[head];
  const childTree: Record<string, unknown> =
    typeof existing === "object" && existing !== null && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};

  const nextChild = setPath(childTree, rest, value);
  if (Object.keys(nextChild).length === 0) {
    return omitKey(obj, head);
  }
  return { ...obj, [head]: nextChild };
}

// ----------------------------------------------------------------------------
// Singleton — v1 has one project open at a time
// ----------------------------------------------------------------------------

export const docStore: DocStore = createDocStore();
