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

import type { Connection, Element, LayerId, ProjectDocument } from "@/core/schema/schema";

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

  /** Update a single property on a connection. */
  updateConnectionProperty(connectionId: string, key: string, value: unknown): void;

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
    },

    discard() {
      if (committedSnapshot === null) return;
      yDoc.transact(() => {
        yRoot.set(DOC_KEY, committedSnapshot);
      });
      undoManager.clear();
    },

    dirty() {
      const current = readDoc();
      if (current === null && committedSnapshot === null) return false;
      return stableStringify(current) !== stableStringify(committedSnapshot);
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

    updateConnectionProperty(connectionId, key, value) {
      mutate((doc) => {
        const connections = doc.connections.map((c): Connection => {
          if (c.id !== connectionId) return c;
          // Only allowed top-level keys; we keep this typed loose because
          // Connection has a discriminated property surface and editing is
          // mostly for `protocol` and `type` in v1.
          return { ...c, [key]: value };
        });
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
 * JSON.stringify with alphabetically-sorted keys at every nesting level.
 * Guards against false dirty-positives caused by key-insertion-order differences
 * between the committed snapshot and a document reconstructed via object spreads.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown): unknown => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
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
