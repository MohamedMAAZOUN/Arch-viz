# Architecture Visualizer — Engineering Guide

**Version**: 1.0.0
**Audience**: anyone writing or reviewing code in this repository — including yourself in six months.

This is not a generic coding standards document. It is the specific set of rules for *this* project, derived from the architectural decisions made during design. Every rule here exists because we already chose, deliberately, a certain way to build this product. The rules make that choice durable.

If you disagree with a rule, the right path is to open an ADR proposing a change. Until that ADR is accepted, the rule stands.

---

## Table of contents

1. [The five non-negotiable principles](#1-the-five-non-negotiable-principles)
2. [Repository structure](#2-repository-structure)
3. [TypeScript discipline](#3-typescript-discipline)
4. [React patterns](#4-react-patterns)
5. [State management](#5-state-management)
6. [Styling](#6-styling)
7. [Naming](#7-naming)
8. [File organization](#8-file-organization)
9. [Function design](#9-function-design)
10. [Error handling](#10-error-handling)
11. [Testing](#11-testing)
12. [Performance](#12-performance)
13. [Accessibility](#13-accessibility)
14. [Git workflow](#14-git-workflow)
15. [Code review](#15-code-review)
16. [Documentation](#16-documentation)
17. [Anti-patterns reference](#17-anti-patterns-reference)
18. [Tooling and CI](#18-tooling-and-ci)
19. [Gotchas](#19-gotchas--non-obvious-traps-the-codebase-has-already-hit)

---

## 1. The five non-negotiable principles

Every rule below descends from one of these. If you ever find yourself fighting a rule, check which principle it serves — the violation is usually upstream.

### Principle 1 · One source of truth

The `Y.Doc` is the source of truth for the draft project document. Everything visible on the canvas, in the inspector, in the URL, in any side effect — *everything* — is a derivation of that document. There is no parallel state that "duplicates" any field of the document.

The committed document on disk is the source of truth for what has been saved. The draft is the source of truth for what is being edited. There is never a third version "in flight" anywhere.

### Principle 2 · Wrap external libraries

React Flow, ELK.js, Yjs, and Monaco (when added) each enter the codebase through *exactly one* file. That file is the only place their types are imported. Every other file talks to our wrapper interfaces.

This rule is the single most important durability decision in the project. Libraries get rewritten, abandoned, or rebranded. Our codebase must survive those events with bounded migration work.

### Principle 3 · Render is a pure function

```
render(committedDoc, draftDoc, viewState) → DOM
```

The same inputs always produce the same output. No render reads from anywhere other than its arguments and the design tokens. No `Math.random()`, no `Date.now()`, no `localStorage.getItem()` inside a render path. Side effects live in event handlers, effects, or workers — never in render.

### Principle 4 · Boundaries validate

Data crossing into the application is validated. YAML loaded from disk → Zod. JSON received from a future API → Zod. URL params → Zod. localStorage rehydration → Zod. Once validated, the data inside the application is trusted. We never re-validate the same value twice in the same code path.

This means: no defensive null checks deep in the call graph. If a function receives a `ProjectDocument`, it is a valid `ProjectDocument`. Period.

### Principle 5 · The schema is law

The Zod schema in `schema.ts` is the contract. UI shapes itself to the schema, not the other way around. If a feature requires a schema change, change the schema first — including its version, validation, and migration if needed — *then* build the UI. No feature ships with "we'll fix the schema later."

---

## 2. Repository structure

We organize by **feature**, not by technical layer. A "feature" is a user-visible capability of the tool (canvas, inspector, mvp-slider, tours, brand-picker). Cross-cutting concerns live in `core/`.

```
arch-vis/
├── public/                       # static assets (favicon, robots.txt)
├── src/
│   ├── main.tsx                  # entry point — does ONE thing: render <App/>
│   ├── App.tsx                   # top-level layout: topbar, canvas, inspector
│   │
│   ├── design-system/            # tokens, theme runtime — already exists
│   │   ├── tokens.css
│   │   ├── tokens.ts
│   │   ├── theme.ts
│   │   └── primitives/           # shadcn/ui components (themed)
│   │
│   ├── core/                     # cross-cutting infrastructure
│   │   ├── schema/               # Zod definitions, parsing, validation
│   │   │   ├── schema.ts
│   │   │   └── parse.ts
│   │   ├── doc/                  # the Yjs source of truth + draft mgmt
│   │   │   ├── DocStore.ts       # ONLY file that imports yjs
│   │   │   ├── resolve.ts        # effective-state-at-(layer, mvp) function
│   │   │   └── persistence.ts    # file save/load + IndexedDB (ONLY file that imports y-indexeddb)
│   │   ├── state/                # Zustand stores (view state, not doc state)
│   │   │   ├── viewStore.ts
│   │   │   └── selectionStore.ts
│   │   ├── layout/               # ELK wrapper
│   │   │   ├── LayoutEngine.ts   # interface
│   │   │   ├── ElkLayoutEngine.ts# ONLY file that imports elkjs
│   │   │   └── layout.worker.ts  # the web worker
│   │   └── errors/               # Result type, assertNever
│   │       ├── index.ts          # public surface: Result, ok, err, unwrap, assertNever
│   │       └── result.ts         # Result discriminated union + helpers
│   │
│   ├── features/                 # user-visible capabilities
│   │   ├── canvas/               # React Flow wrapper + node renderers
│   │   │   ├── Canvas.tsx        # ONLY file that imports @xyflow/react
│   │   │   ├── nodes/            # per-type node components
│   │   │   ├── edges/            # per-type edge components
│   │   │   └── viewport.ts
│   │   ├── inspector/            # right-side panel
│   │   │   ├── Inspector.tsx
│   │   │   └── sections/         # one file per inspector section
│   │   ├── mvp-slider/
│   │   ├── layer-toggle/
│   │   ├── tour/
│   │   ├── settings/             # the settings menu (theme/brand picker lives here)
│   │   └── topbar/
│   │
│   ├── lib/                      # tiny pure utilities (no React, no state)
│   │   ├── id.ts
│   │   ├── arr.ts
│   │   └── debounce.ts
│   │
│   └── types/                    # ambient TS types only — not type definitions
│
├── tests/                        # E2E (Playwright)
├── docs/
│   ├── adr/                      # architecture decision records
│   ├── schema-v1.0.0.yaml        # the example schema (already produced)
│   └── ...
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
└── README.md
```

### Rules

- **One feature per folder**. A new top-level feature is a folder under `features/`, never a file.
- **Tests live next to the code they test**: `Foo.tsx` ↔ `Foo.test.tsx`. The `tests/` folder is *only* for E2E.
- **`core/` modules cannot import from `features/`**. The dependency arrow always points inward.
- **`features/` modules can import from `core/`, `design-system/`, and `lib/`** — but not from sibling features.
- **`lib/` is for pure utilities only**. No React, no Zustand, no Yjs. If it imports any of those, it belongs in `core/`.
- **Cross-feature communication goes through `core/state`**, never through direct imports.

---

## 3. TypeScript discipline

We target strict TypeScript. Every escape hatch is a written exception, not a habit.

### Compiler flags (non-negotiable)

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,    // arr[i] is T | undefined
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "skipLibCheck": true                  // lib types are out of our control;
                                          // app-code types remain fully strict
  }
}
```

### Rules

- **No `any`**. If you must escape the type system, use `unknown` and narrow. The only allowed `any` is in interop with third-party libraries that genuinely have no types — and even then, contain it to one file with a leading `// eslint-disable-next-line` comment explaining why.

- **No `as` casts** except: (a) narrowing a `unknown` after a runtime check Zod can't express, or (b) interop with DOM APIs where TS lib types are wrong. Every cast carries a comment explaining the safety argument.

- **Types inferred from Zod, not duplicated**. If a type exists in `schema.ts`, import it from there. Do not redeclare it.

  ```ts
  // ✓ Good
  import type { Element } from "@/core/schema/schema";

  // ✗ Bad — drifts from the schema
  type Element = { id: string; type: string; ... };
  ```

- **Discriminated unions for variants**. When a thing has "kinds," use a literal discriminator field. Never use boolean flags ("isService", "isDatabase") for what could be a `type: "service" | "database"`.

- **Branded types for ids** *(deferred — not yet implemented in v1)*. The intent is that element ids are not just strings — they carry meaning — and branding would prevent passing a connection id where an element id is expected:

  ```ts
  type Brand<T, B> = T & { readonly __brand: B };
  export type ElementId = Brand<string, "ElementId">;
  export type ConnectionId = Brand<string, "ConnectionId">;
  export type MvpId = Brand<string, "MvpId">;
  ```

  **As of v1, ids are plain `string`** throughout `schema.ts` and the codebase. Branding is an aspirational improvement, not a current requirement — do not assume branded id types exist when writing code. Introducing them is a tracked future change (it touches every id-handling call site), not something to retrofit piecemeal.

- **`readonly` everywhere it's accurate**. Function parameters, array fields, return types. The default mental model is "this value will not be mutated."

- **No `enum`s**. Use string literal unions: `type Layer = "business" | "architecture" | "engineering"`. They compile to nothing, work with `switch` exhaustiveness, and don't have the `enum` runtime weirdness.

- **Exhaustive switches via `never`**. When switching on a discriminated union, end with `default: return assertNever(x)` — TypeScript will fail the build if a new variant is added without a corresponding case.

  ```ts
  import { assertNever } from "@/core/errors";

  function edgeIsAnimated(type: ConnectionType): boolean {
    switch (type) {
      case "sync": return false;
      case "async": return true;
      // ... other cases ...
      default: return assertNever(type);
    }
  }
  ```

- **Prefer `type` over `interface`** for everything except objects that need declaration merging (which is rare and a signal to stop).

---

## 4. React patterns

### Components

- **Function components only**. No class components, ever.
- **One component per file**. Exception: tiny presentational siblings used only by the main component (e.g., `<NodeBadge>` inside `Node.tsx`).
- **Components are pure**. They take props, return JSX, don't read from anywhere else. State, refs, and effects are the only allowed exceptions.
- **Default export is the component; everything else is named export**. This makes imports consistent: `import Canvas from "./Canvas"` always gets the component.
- **Props are objects, destructured at the signature**. Even for one prop. Keeps the signature uniform when props grow.

  ```tsx
  // ✓ Good
  function Inspector({ selectedId, layer }: InspectorProps) { ... }

  // ✗ Bad
  function Inspector(props: InspectorProps) {
    const { selectedId, layer } = props;
    ...
  }
  ```

### Hooks

- **Rules of Hooks, no exceptions**. Top of component, never conditional, never in loops.
- **Custom hooks start with `use`**. Always.
- **`useEffect` is a last resort**. Most things people put in `useEffect` belong elsewhere: derived state, event handlers, or refs. The two legitimate uses are: (a) synchronizing with external systems (subscribing to a Yjs observe, a websocket, etc.), and (b) firing imperative side effects that cannot live in a handler (focus management, scroll restoration).
- **Always specify deps**. Never `useEffect(fn)` without `[]`. ESLint enforces this.
- **Memoize when measurement says so, not by reflex**. `useMemo` and `useCallback` have a cost — they make code harder to read for a fence-post change. The default is no memoization. Memoize when:
  - The computation is genuinely expensive (>1ms in a profiler), or
  - You're passing the value to a `React.memo`'d child that needs reference stability, or
  - You're depending on it in another hook.

### State

- **Local state for local UI** (popover open, hover state, controlled input). `useState` is fine.
- **Shared view state** (selected element, current layer, current MVP) → Zustand (`viewStore`).
- **Document state** (the project) → `DocStore` (Yjs-backed). Never duplicate in `useState`.
- **No Context for state**. Context for *static* configuration (theme, locale) is fine; for dynamic state it triggers cascading re-renders. Use Zustand.

### Refs

- **Refs for DOM access only**. Never use a ref as a way to "remember a value without re-rendering" — that's state, and if it doesn't need to re-render, it's probably wrong design.
- **`useRef` initialized lazily** when the initial value is expensive: `useRef<T | null>(null)` and assign on first access.

### Lists

- **Stable `key` always**. Index keys are forbidden unless the list is truly static and never reorders. Use the entity's id.
- **No inline functions in render** for handlers passed to `React.memo`'d children. Use `useCallback`.

---

## 5. State management

The mental model has three tiers. Putting state in the wrong tier is the #1 source of bugs in this kind of app — be precise.

### Tier 1 · Document state (Yjs)

Everything that is part of the project document:
- Elements, connections, lifecycle, properties
- Tours, layout overrides
- MVPs, layers (though layers are fixed in v1)

Lives in `Y.Doc`. Accessed only via `DocStore` operations. Persisted to localStorage continuously (draft) and to file on Save (committed).

**Why Yjs and not just an immutable object**: free undo/redo via `Y.UndoManager`, free IndexedDB persistence via `y-indexeddb`, free multiplayer in v2. The price is a non-trivial mental model, contained to `DocStore.ts`.

### Tier 2 · View state (Zustand)

Everything about *how the user is currently looking at* the document:
- Selected element
- Current layer (business / architecture / engineering)
- Current MVP (or overlay set)
- Viewport (pan/zoom)
- Inspector section expansion state
- Tour playback position
- Modal/menu open states

Lives in Zustand stores. Slim, granular selectors. Each store has one concern: `viewStore`, `selectionStore`, `tourPlaybackStore`. Don't dump everything into one mega-store.

**Why not in Yjs**: this state is per-session and per-user, not part of the project. Storing it in the document would make multiplayer messy (each user wants their own selection, not a shared one).

### Tier 3 · Local state (`useState`)

Truly component-local:
- Form field values before commit
- Hover/focus state
- Popover open state for a single component
- Animation refs

Use `useState` directly.

### The rule of escalation

When state needs to be read by a sibling component, escalate to Zustand. When state needs to be persisted across reloads, escalate to Yjs (if document) or localStorage (if user preference). Never prop-drill more than two levels.

### Selectors

Zustand selectors must be **as narrow as possible**. A component that needs only `currentLayer` should subscribe only to `currentLayer`, not the whole store:

```ts
// ✓ Good
const currentLayer = useViewStore(s => s.currentLayer);

// ✗ Bad — re-renders on every store change
const { currentLayer } = useViewStore();
```

For derived values that depend on multiple fields, use `useShallow`:

```ts
const { currentLayer, currentMvp } = useViewStore(
  useShallow(s => ({ currentLayer: s.currentLayer, currentMvp: s.currentMvp }))
);
```

### The DocStore API

`DocStore` exposes high-level operations, never raw Y.Doc access. The rest of the app calls:

```ts
// Lifecycle
docStore.load(project);               // load a project (use loadProject() helper instead)
docStore.get();                        // current snapshot or null
docStore.subscribe(handler);          // subscribe to doc changes; returns unsubscribe fn
docStore.commit();                    // promote draft → committed (marks as saved)
docStore.discard();                   // roll back draft to committed
docStore.dirty();                     // true if draft differs from committed

// Undo / redo
docStore.undo();
docStore.redo();
docStore.canUndo();
docStore.canRedo();

// Element mutations
docStore.updateElementName(id, name);
docStore.updateElementProperty(id, key, value);        // pass null to remove the key
docStore.updateElementPropertyPath(id, path, value);   // nested path, null to remove leaf

// Connection mutations
docStore.updateConnectionProperty(id, key, value);

// Layout overrides
docStore.setElementLayoutOverride(layer, elementId, position);  // null to clear
docStore.clearLayerOverrides(layer);
```

**Prefer `loadProject()` over `docStore.load()` directly.** `loadProject()` also resets
the view state (current MVP, current layer) to sensible defaults so the canvas is
never blank after load.

The Y.Doc internals never leak. If a feature needs an operation that doesn't exist, add a new operation — don't reach into the doc directly.

---

## 6. Styling

### The single rule

**Theming travels through CSS variables. Layout, spacing, and structure travel through Tailwind utilities.**

If a property should change based on theme or brand (any color, certain shadows, certain borders) → CSS variable: `var(--color-bg-2)`.

If a property is structural (padding, gap, grid, flexbox) → Tailwind utility: `p-4`, `gap-3`, `grid-cols-2`.

### Concrete examples

```tsx
// ✓ Good — colors via tokens, layout via Tailwind
<div className="flex gap-3 p-4 rounded-md"
     style={{
       background: "var(--color-bg-2)",
       border: "1px solid var(--color-border-default)",
     }}>

// ✗ Bad — hardcoded hex, breaks theming
<div className="flex gap-3 p-4 rounded-md bg-[#1a1a2e]">

// ✗ Bad — magic spacing values
<div className="flex" style={{ gap: "13px", padding: "21px" }}>
```

### Component composition

- **shadcn/ui primitives are the default starting point** for buttons, inputs, dialogs, tabs, accordions. They're already themed against our tokens.
- **Don't duplicate primitives**. If shadcn doesn't have what you need, extend a primitive rather than building a new one.
- **Variants via discriminated props**, not boolean flags:

  ```tsx
  type ButtonProps = { variant: "primary" | "secondary" | "ghost"; ... };
  // not: { isPrimary?: boolean; isSecondary?: boolean; isGhost?: boolean }
  ```

### What's forbidden in component code

- Hex colors (`#FFAA00`)
- RGB/RGBA literals (`rgb(255, 170, 0)`)
- Magic numeric pixels for spacing (`padding: 13px`)
- Inline `transition: 200ms` — use `var(--duration-base)`
- Inline `z-index: 999` — use `var(--z-...)`
- Per-component shadows — use `var(--elevation-N)`

### Motion

Always import durations from `design-system/tokens.ts`, not raw milliseconds:

```ts
import { duration, ease, spring } from "@/design-system/tokens";

<motion.div
  animate={{ opacity: 1 }}
  transition={{ duration: duration.base / 1000, ease: ease.out }}
/>
```

`prefers-reduced-motion` is respected automatically through token zeroing. Don't add a parallel reduced-motion check.

---

## 7. Naming

### Files

| Kind | Convention | Example |
|---|---|---|
| React component | PascalCase | `Canvas.tsx`, `Inspector.tsx` |
| Hook | camelCase, `use*` prefix | `useSelection.ts` |
| Store | camelCase, `Store` suffix | `viewStore.ts` |
| Pure utility | camelCase | `debounce.ts`, `arr.ts` |
| Type-only module | camelCase | `types.ts` |
| Constants module | camelCase | `tokens.ts` |
| Test | matches subject + `.test` | `Canvas.test.tsx` |
| Worker | descriptive + `.worker` | `layout.worker.ts` |
| Asset | kebab-case | `michelin-logo.svg` |

### Identifiers

- **Components**: PascalCase. `Inspector`, `MvpSlider`, `CanvasNode`.
- **Functions**: camelCase, verb-first when they do something. `resolveElementAt`, `commitDraft`, `applyLayout`.
- **Variables**: camelCase, descriptive. `selectedElementId`, not `sel` or `id`. Length is cheap; ambiguity is expensive.
- **Booleans**: `is/has/should/can` prefix. `isDirty`, `hasUnsavedChanges`, `shouldShowTour`, `canEdit`. Never bare nouns like `dirty` or `valid`.
- **Constants**: SCREAMING_SNAKE_CASE for module-level true constants. `MAX_NODES_PER_VIEW = 1000`. camelCase for "settings" objects that aren't constants in the deep sense.
- **Types**: PascalCase. `ProjectDocument`, `Element`, `Connection`.
- **Type parameters**: Single capital letter or full descriptive name. `T`, `K`, `V` for ergonomics; `TElement`, `TConnection` when there are multiple and clarity matters.
- **Private to file**: leading underscore on unexported helpers if it helps reading. Not enforced; use judgment.

### Avoid

- Abbreviations the team doesn't share. `mvp` is fine (we say it constantly). `cfg` for config is not — write `config`.
- `Manager`, `Handler`, `Helper`, `Utility` suffixes — they're meaningless. Name by what the thing does.
- `data`, `info`, `item`, `obj`, `temp` — these are placeholders, not names.

---

## 8. File organization

### Order within a file

```ts
// 1. Imports — grouped, blank line between groups
import { useState } from "react";

import { motion } from "motion/react";

import { useViewStore } from "@/core/state/viewStore";
import { DocStore } from "@/core/doc/DocStore";

import type { ElementId } from "@/core/schema/schema";

// 2. Module-level types
type LocalProps = { ... };

// 3. Module-level constants
const COLLAPSE_THRESHOLD = 80;

// 4. The main export
export default function Inspector({ ... }: InspectorProps) { ... }

// 5. Helpers (pure functions used by the main export)
function computeSomething(...) { ... }
```

### Import order

Three groups, blank line between:
1. **External modules** (react, motion, zod, etc.)
2. **Internal modules** (`@/core/...`, `@/features/...`)
3. **Type-only imports** (`import type { ... }`)

ESLint enforces this. Don't waste effort sorting manually.

### File size

- **Soft limit: 300 lines.** When a file passes 300, ask whether it should be split.
- **Hard limit: 500 lines.** Required justification in a comment at the top.

Splitting strategies, in order of preference:
1. Extract a helper function to a sibling file.
2. Extract a sub-component (its props become an interface; pass only what it needs).
3. Extract a custom hook for shared stateful logic.
4. Split by feature subdomain.

### One thing per file

The file is the unit of organization. Each file has one job. A `Canvas.tsx` file holds the Canvas component, its props type, and tightly-coupled helpers. It does not hold unrelated utilities.

---

## 9. Function design

### Length

- **Soft limit: 50 lines.** Most functions should fit on one screen.
- **Hard limit: 100 lines.** Beyond this, you've combined responsibilities.

If your function has section comments (`// === Validate ===`, `// === Compute ===`, `// === Apply ===`), the sections are usually subfunctions waiting to be extracted.

### Parameters

- **Three parameters max for positional**. Past three, pass an options object.
- **Required first, optional last**.
- **Options objects use TypeScript types, not interfaces** (consistency with the rest of the codebase).

```ts
// ✓ Good
function applyLayout(
  nodes: readonly Node[],
  edges: readonly Edge[],
  options: { algorithm: LayoutAlgorithm; padding?: number } = { algorithm: "layered" }
) { ... }
```

### Purity preferred

Pure functions (no side effects, same input → same output) are easier to test, easier to memoize, and easier to reason about. Push impurity to the edges.

```ts
// ✓ Good — pure, testable
function resolveElementAt(doc: ProjectDocument, layer: LayerId, mvp: MvpId): readonly Element[] { ... }

// ✗ Bad — reads global state, hard to test
function getVisibleElements(): readonly Element[] {
  const doc = DocStore.getCurrent();
  const { currentLayer, currentMvp } = useViewStore.getState();
  ...
}
```

### Early returns

Prefer early returns over nested conditions. Reduces visual indentation and clarifies the happy path.

```ts
// ✓ Good
function update(id: ElementId, patch: Partial<Element>) {
  if (!id) return;
  if (!isValidPatch(patch)) return;
  applyPatch(id, patch);
}

// ✗ Bad
function update(id: ElementId, patch: Partial<Element>) {
  if (id) {
    if (isValidPatch(patch)) {
      applyPatch(id, patch);
    }
  }
}
```

### Naming

A function's name should match what it does. If you're tempted to write a comment explaining what the function does, that comment should usually be the function's name.

---

## 10. Error handling

### The two categories of failure

1. **Expected failures**: invalid user input, file load with a malformed schema, network blip. Handled explicitly. User sees a useful message.
2. **Unexpected failures**: bugs, broken invariants, "this should never happen." Surfaced to the developer (sentry-style), not silently swallowed.

### Validation errors (category 1)

Use `safeParse` at boundaries and return result-style values:

```ts
type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function loadProject(raw: unknown): Result<ProjectDocument> {
  const parsed = ProjectDocument.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  return { ok: true, value: parsed.data };
}
```

User-facing errors surface in:
- A toast for transient operations (save failed)
- The inspector's Diagnostics section for document-level issues (broken links, orphan nodes)
- An error boundary for unrecoverable render failures

### Programming errors (category 2)

Throw. Don't catch. Let it bubble to an error boundary. Then fix the bug.

```ts
// ✓ Good — clear intent, fails loudly
function assertElementExists(doc: ProjectDocument, id: ElementId): Element {
  const el = doc.elements.find(e => e.id === id);
  if (!el) throw new Error(`assertElementExists: ${id} not found`);
  return el;
}

// ✗ Bad — silent failure leaves the app in an unknown state
function maybeGetElement(doc: ProjectDocument, id: ElementId): Element | null {
  return doc.elements.find(e => e.id === id) ?? null;
  // ...and callers all forget to handle null
}
```

### Never silent

The forbidden pattern:

```ts
try {
  doRiskyThing();
} catch {} // ← never
```

Every `catch` either logs (for category 2), surfaces an error to the user (category 1), or has a comment explaining why suppression is correct.

---

## 11. Testing

### What we test

| Layer | Tool | What |
|---|---|---|
| Pure functions | Vitest | Every public function in `core/` and `lib/` |
| Schema | Vitest + real Zod | Positive cases, every cross-field invariant, edge cases |
| React components | Testing Library | Behavior under user interaction. Not implementation details. |
| Hooks | `renderHook` | Hooks with non-trivial logic (most don't need it) |
| Integration | Vitest + DOM | DocStore + viewStore working together |
| End-to-end | Playwright | Critical user flows: load → edit → save → reload |

### What we don't test

- Layout values, colors, exact pixel positions — these are visual, not behavioral
- Third-party library internals
- Trivial getters/setters
- "Did this component render" tautologies

### Naming

```ts
// ✓ Good — describes behavior
test("commits the draft when save is called");
test("removes layout overrides when an element changes parent");
test("rejects a document referencing an unknown MVP");

// ✗ Bad
test("Inspector works");
test("test 1");
```

### Coverage

We don't chase a coverage percentage. We aim for **meaningful tests on every behavior the spec promises**. If a behavior is in the README or schema docs, there is a test for it.

### Schema testing

Never mock the schema. Always use the real Zod parser in tests. The schema is the contract; testing against a mock contract proves nothing.

---

## 12. Performance

### Budgets

| Metric | Budget | Where measured |
|---|---|---|
| First-load JS (gzipped) | ≤ 400 KB | CI bundle analyzer |
| Total JS including ELK worker | ≤ 700 KB | CI bundle analyzer |
| Time to Interactive on M2 / 4G | ≤ 2.5s | Lighthouse |
| Canvas render at 300 nodes | ≤ 16ms per frame | dev profiler |
| MVP slider scrub | 60fps sustained | dev profiler |
| Layout recompute (100 nodes) | ≤ 200ms in worker | DocStore log |

If a change pushes a budget, the PR addresses it (lazy-load, defer, alternative library) before merge.

### Rules

- **Memoize for measured wins, not by default.** `useMemo` is not free.
- **Avoid re-renders by selector narrowness**, not by `React.memo` walls.
- **Heavy work goes to workers**. ELK in `layout.worker.ts`. Any future image processing, diffing, or large-scale transforms also off-main-thread.
- **Long lists virtualize**. React Flow virtualizes nodes by viewport automatically; we keep that on. Inspector lists past 50 items use a virtualizer.
- **Animation uses transforms and opacity only**. Never animate `width`, `height`, `top`, `left` — they trigger layout.
- **`will-change` when animating**, removed when done.

### Lazy loading

Code-split aggressively:

```ts
// ✓ Tour mode is rarely opened — split it
const TourPlayer = lazy(() => import("@/features/tour/TourPlayer"));

// ✓ Monaco (when added) is HUGE — split it
const YamlEditor = lazy(() => import("@/features/yaml-editor/YamlEditor"));
```

Suspense fallbacks use the design system's loading primitives, not raw spinners.

---

## 13. Accessibility

### Baseline

- **Keyboard navigable**. Every interactive element reachable by Tab. Tab order matches visual order.
- **Visible focus**. Focus rings use `--color-accent-base` — already in the tokens. Never `outline: none` without a replacement.
- **ARIA labels** on icon-only buttons. `aria-label="Toggle layer"` not just `<Icon/>`.
- **Color is not the only signal**. Selection has glow + ring + state. Layer changes have tint + label. Critical state has color + icon.
- **`prefers-reduced-motion` respected** automatically through token zeroing.

### Canvas accessibility

The canvas is hard. v1 standards:
- Tab moves focus through visible nodes in z-order.
- Arrow keys pan the viewport.
- `+`/`-` zoom.
- `Esc` clears selection.
- A screen-reader-only landmark region announces the current layer, MVP, and selected element.

Full screen-reader graph navigation is a v2 goal — not v1.

### Color contrast

Tokens are designed for WCAG AA in both themes. Verify with the browser devtools when adding new color combinations. AAA-only token combinations get an `aria-hidden` companion text where they matter.

---

## 14. Git workflow

### Branches

- `main` — always deployable. No direct commits.
- `dev` — integration branch. PRs land here first.
- `feature/<short-kebab-name>` — feature work.
- `fix/<short-kebab-name>` — bug fixes.
- `chore/<short-kebab-name>` — housekeeping (deps, CI, docs).
- `adr/<number>-<title>` — architecture decisions.

### Commits

[Conventional Commits](https://www.conventionalcommits.org/). Format:

```
<type>(<scope>): <short description>

<optional longer body explaining WHY, not WHAT>

<optional footer: BREAKING CHANGE, Refs #123>
```

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`.

Examples:

```
feat(canvas): add minimap with brand-aware styling
fix(doc): preserve layout overrides when element parent changes
refactor(layout): extract dedupe logic from ElkLayoutEngine
docs(adr): record decision to defer Monaco to v1.5
```

### Pull requests

- **One PR, one concern.** A refactor that "also" fixes a bug is two PRs.
- **Soft limit: 400 LOC changed.** Past 400, split.
- **Description template** (auto-applied by `.github/pull_request_template.md`):

  ```
  ## What
  One sentence describing the change.

  ## Why
  The user-visible or architectural reason.

  ## How
  Notable implementation choices.

  ## Verification
  How you confirmed it works. Screenshots for UI.

  ## Risks
  What could break. What was NOT tested.
  ```

- **Self-review first.** Read the diff in the PR view before requesting a review. Half the comments would be your own.

### Required checks before merge

- All tests pass
- TypeScript compiles with zero errors and zero warnings
- ESLint passes with zero errors and zero warnings
- Bundle size stays within budget
- At least one human approval

---

## 15. Code review

### Reviewer responsibilities

Reviews answer four questions, in order:

1. **Does it work?** Does the code do what the PR description says?
2. **Does it fit?** Is it consistent with the architecture and conventions?
3. **Is it understandable?** Will someone reading this in six months grasp the intent?
4. **Is it maintainable?** Are tests adequate? Is it appropriately decoupled?

If the answer to all four is yes, approve. If not, comment specifically — never just "this seems off."

### How to give feedback

- **Distinguish blockers from suggestions.** Prefix with `nit:` for non-blocking, `q:` for questions, `blocker:` for must-fix.
- **Suggest the fix when obvious.** Don't make the author guess.
- **Praise good moves.** Architectural improvements, clean abstractions, sharp tests deserve acknowledgment.
- **Don't review style.** ESLint and Prettier handle that. If you're commenting on whitespace, the linter is misconfigured.

### Author responsibilities

- **Respond to every comment.** Even "agreed, fixed in <commit>" or "out of scope, opened #<issue>."
- **Don't argue in threads. Discuss in calls.** A back-and-forth past two replies signals a conversation, not a comment thread.
- **Squash before merge.** One PR = one commit on `dev`. The history is a story, not a transcript.

---

## 16. Documentation

### Three levels, three audiences

1. **README.md (repo root)** — for someone landing on the repo for the first time. What is this, how do I run it, where do I look next. Five minutes to read.
2. **Per-folder README** (in `features/`, `core/`, `design-system/`) — for someone who knows the project and is about to work in this area. Explains the local conventions and the entry points.
3. **ADRs (`docs/adr/`)** — for someone who needs to know *why* a decision was made. One file per decision.

### JSDoc

- **Public exports from `core/` modules**: yes, JSDoc the public API. The signature isn't enough — explain when to use it and what guarantees it makes.
- **React components**: no JSDoc by default. Props types and the component name carry the meaning. Add a comment block only when the component has non-obvious behavior.
- **Internal helpers**: no JSDoc. Name them well, structure them clearly.

### Inline comments

- **Explain why, never what.** The code shows what. The comment shows why.
- **Mark non-obvious decisions.** A `// We use a Set here because we look up by id 50+ times per frame` saves future-you ten minutes.
- **No commented-out code.** Delete it. Git remembers.
- **TODO comments include the author and a ticket.** `// TODO(mohamed, #142): handle the 1k-node case` — not bare `// TODO`.

### ADRs

When to write one:
- Choosing between two viable libraries (or building vs adopting)
- Changing an architectural rule from this guide
- Establishing a new pattern likely to be repeated

Format (one page max):

```
# ADR-NNNN: <short title>

## Status
Proposed | Accepted | Superseded by ADR-XXXX

## Context
What problem are we solving? What constraints apply?

## Decision
What we chose.

## Consequences
What gets easier. What gets harder. What we're now committed to.

## Alternatives considered
What else we looked at and why we passed.
```

The ADRs we already need to write down: schema design, Yjs as source of truth, React Flow wrapper rule, per-layer position model, brand variant approach, Monaco deferral.

---

## 17. Anti-patterns reference

A condensed list of patterns that fail review. When you spot one in a PR, link to this section.

### Architecture

- Importing `@xyflow/react`, `elkjs`, or `yjs` outside their designated wrapper file.
- A new top-level `features/` folder that depends on a sibling `features/` folder.
- A `core/` module that imports from `features/`.
- `useEffect` that synchronizes derived state — derive it instead.
- Document state stored in `useState`.

### TypeScript

- `any`, `as any`, `@ts-ignore`, `@ts-expect-error` without an explanatory comment.
- A type that duplicates a Zod-inferred type.
- Boolean discriminators (`isService`, `isDatabase`) instead of a literal-union `type` field.
- Default values on optional Zod fields that disagree with TypeScript defaults.

### React

- `useEffect` with no dependency array, or with a stale dependency.
- Inline object/function props passed to `React.memo`'d children.
- Index-based `key` on a list that can reorder.
- `useState` for a derived value.
- Direct DOM manipulation through `document.querySelector` outside very narrow integration points.

### Styling

- Hex / RGB literals in component code.
- Magic pixel values for spacing or duration.
- `style={{ color: ... }}` for anything that should theme.
- `outline: none` without a focus indicator replacement.
- New tokens added to `tokens.css` without README mention.

### Testing

- Tests that mock the schema.
- Tests that assert on internal state (`expect(component.state.x).toBe(...)`).
- Tests with `setTimeout` waits longer than 100ms.
- E2E tests for unit-testable logic.

### Process

- A PR that mixes a refactor with a feature.
- A PR with no description.
- A commit message that's just `wip` or `fix` (use `chore: wip` if you must push).
- Merging your own PR without an approval.

---

## 18. Tooling and CI

### Required tooling

| Tool | Purpose | Config |
|---|---|---|
| **pnpm** | package manager | `package.json` engines pin |
| **Vite** | build & dev server | `vite.config.ts` |
| **TypeScript 5.x** | type system | `tsconfig.json` |
| **ESLint 9** | linting | flat config `eslint.config.js` |
| **Prettier** | formatting | `.prettierrc` |
| **Vitest** | unit tests | `vitest.config.ts` |
| **Playwright** | E2E | `playwright.config.ts` |
| **Husky + lint-staged** | pre-commit | `.husky/` |
| **Renovate** | dep updates | `renovate.json` |

### ESLint

Flat config, TypeScript-aware, React-aware. Required rule sets:

- `@typescript-eslint/recommended-type-checked`
- `@typescript-eslint/strict-type-checked`
- `eslint-plugin-react-hooks` (recommended)
- `eslint-plugin-react-refresh` (vite + HMR)
- `eslint-plugin-import` (import order, no-cycle)
- Custom rules forbidding direct imports of wrapped libraries outside their designated files.

Warnings = errors. CI blocks on any.

### Prettier

Format on save (editor) and pre-commit (husky). Settings: 2 spaces, single quotes for JS/TS, no semicolons OFF (we use semicolons — explicit > implicit), 100-char line, trailing commas everywhere.

### Pre-commit

```yaml
lint-staged:
  *.{ts,tsx}:
    - eslint --fix
    - prettier --write
  *.{css,md,json,yaml}:
    - prettier --write
```

### CI pipeline

GitHub Actions, on every PR:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test --run`
5. `pnpm build`
6. Bundle size check (compare to `main` baseline; fail if over budget)
7. Playwright E2E on PR-ready branches

On merge to `main`:
8. Deploy preview to staging
9. Run smoke tests against staging

### IDE setup

Recommended (not required) — settings checked into `.vscode/`:
- ESLint extension
- Prettier extension
- Tailwind IntelliSense
- Vitest extension
- "Format on save" enabled
- "Import organize on save" enabled

---

## 19. Gotchas — non-obvious traps the codebase has already hit

These are documented because we wasted time on them once. Don't waste time on them again.

### ELK in a Web Worker — use `elk-api.js`, not `elk.bundled.js`

`layout.worker.ts` imports from `elkjs/lib/elk-api.js` plus `elkjs/lib/elk-worker.min.js?url`. **Do not change this to `elk.bundled.js`.**

`elk.bundled.js` internally does `require('./elk-worker.min.js')` to spawn a sub-worker. Rollup's CJS plugin unwraps that require at build time, which breaks ELK's runtime detection of whether it is inside a worker. The symptom is `_Worker is not a constructor` thrown from inside our outer worker.

`elk-api.js` is the lighter client API. We pass it the `?url`-imported path to `elk-worker.min.js`; Vite emits that file as a standalone asset, and ELK spawns the sub-worker using the global `Worker` constructor (which is available inside our outer worker scope).

ESLint's `no-restricted-imports` blocks `elk.bundled.js` everywhere. The error message points back here.

### Tailwind v4 + Vite plugin version

The `@tailwindcss/vite@4.0.0` release had a bundler bug ("Cannot convert undefined or null to object"). Pin to `4.3.0` or later. Documented in `docs/adr/0001-initial-scaffold.md`.

### `skipLibCheck` is `true`

Strict app-code typechecking with `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` is non-negotiable. But library types (especially React Flow's) sometimes contain expressions that don't satisfy our strictness. We turn off `skipLibCheck` only for lib types, never our own code. If you find yourself disabling a strict flag for app code, stop — there's a real problem to fix.

### React Flow needs `onNodesChange` to apply selection clicks

Without `useNodesState` + `onNodesChange` wired up, the first click on a node is silently dropped (React Flow has no internal node store to apply the selection change to). See `Canvas.tsx` for the established pattern. The same applies to `onEdgesChange` if we ever make edges interactive.

### Nested nodes: parents must precede children, and ELK needs `INCLUDE_CHILDREN`

React Flow silently drops a node whose `parentId` references a node that does
not appear *earlier* in the nodes array. `Canvas.tsx` sorts nodes by layout
depth (ancestors first) before handing them to React Flow — keep that sort if
you touch node construction. A child's position is **relative to its parent**;
a top-level node's position is absolute. `useLayoutedGraph` exposes both so the
canvas can fall back to absolute placement when an intermediate container is
hidden by MVP scrubbing.

On the layout side, the worker sets `elk.hierarchyHandling: INCLUDE_CHILDREN`
so a single ELK pass recurses into compound nodes and routes edges that cross
container boundaries. Container size is computed by ELK (don't pin width/height
on a node that has children); per-container `elk.padding` reserves the header
strip (`CONTAINER_PADDING` in `types.ts`, kept in sync with
`--group-header-height` in `GroupNode.css`).

### `noPropertyAccessFromIndexSignature` requires bracket notation for `dataset`

`element.dataset.theme = ...` fails the strict flag because `DOMStringMap` is index-signature-typed. Use `element.dataset["theme"] = ...` instead. See `design-system/theme.ts`.

---

## Closing

These rules exist to keep this codebase coherent at six months, twelve months, three years. They are not the only way to build software, but they are *our* way. Inconsistency is more expensive than any individual rule's tradeoff.

If you find a rule getting in the way, that's signal. Open an ADR. We update the rules; we don't ignore them.

When in doubt, optimize for the person reading your code in six months who has no context. That person is almost always you.
