# Schema reference (v1.0.0)

The complete, field-by-field reference for an arch-vis project document. The
schema is **law**: the UI shapes itself to this document, never the other way
around.

- **Source of truth:** `packages/schema/src/schema.ts` (Zod, exported as `@arch-vis/schema`). If this doc and the
  code ever disagree, the code wins — fix this doc.
- **Worked example:** `docs/schema-example.yaml` (small e-commerce) and
  `architectures/aurora-platform.yaml` (realistic, 42 elements).
- **How it's loaded:** the YAML on disk is parsed **once** at the trust boundary
  (`parseProjectDocument`). If validation fails, the file is **rejected whole** —
  never partially loaded. Everything downstream treats the model as trusted.

Conventions in this doc: **required** unless marked _optional_; `default: X`
means the field may be omitted and becomes `X` after parsing.

---

## Primitives

| Type | Rule |
|---|---|
| `Id` | kebab-case string, 1–80 chars, `^[a-z0-9][a-z0-9-_]*$` (lowercase letters, digits, dashes, underscores; must start alphanumeric). |
| `MvpRef` | string matching `^mvp\d+$` (e.g. `mvp1`, `mvp2`). |
| `LayerId` | one of `business` · `architecture` · `engineering`. |
| `Tone` | one of `neutral` · `critical` · `warning` · `success` · `muted`. |
| `HexColor` | `#RRGGBB`, exactly six hex digits. |
| `Position` | `{ x: number, y: number }`. |
| `Size` | `{ w: number > 0, h: number > 0 }`. |

---

## Root document

```yaml
$schemaVersion: "1.0.0"   # required, literal
project: { … }            # required
mvps: [ … ]               # required, ≥ 1
layers: [ … ]             # required, exactly 3
elements: [ … ]           # required (may be empty)
connections: [ … ]        # optional, default []
tours: [ … ]              # optional
layout: { … }             # optional
```

| Field | Type | Notes |
|---|---|---|
| `$schemaVersion` | literal `"1.0.0"` | Bumped only on a backward-incompatible change. |
| `project` | `Project` | Project-level metadata. |
| `mvps` | `Mvp[]` | At least one. Defines the time axis. |
| `layers` | `Layer[]` | Exactly three (business / architecture / engineering). |
| `elements` | `Element[]` | The nodes. May be empty. |
| `connections` | `Connection[]` | _optional_, `default: []`. The edges. |
| `tours` | `Tour[]` | _optional_. Guided walkthroughs. |
| `layout` | `PerLayerLayout` | _optional_. Manual position overrides per layer. |

---

## `project`

| Field | Type | Notes |
|---|---|---|
| `id` | `Id` | |
| `name` | `string` (≥ 1) | |
| `description` | `string` | _optional_ |
| `theme` | `string` | `default: "default"` |

## `mvps[]` — the time axis

| Field | Type | Notes |
|---|---|---|
| `id` | `MvpRef` | `mvpN`. |
| `name` | `string` (≥ 1) | Display label (e.g. "Q1 2026"). |
| `order` | positive integer | Sort key along the time axis. Lower = earlier. |
| `color` | `HexColor` | Used by the MVP overlay legend to tint by introducing-MVP. |

`order` — not the numeric part of `id` — defines chronology. Lifecycle
resolution applies every `modifiedIn` entry whose MVP **order** is ≤ the current
MVP's order.

## `layers[]`

Exactly three entries.

| Field | Type | Notes |
|---|---|---|
| `id` | `LayerId` | `business` / `architecture` / `engineering`. |
| `order` | positive integer | Display order of the layer toggle. |
| `label` | `string` (≥ 1) | Human label for the layer. |

---

## `elements[]`

An element is a **discriminated union on `type`**. Every type shares a common
shape; `group` adds one extra field.

### Common fields (all element types)

| Field | Type | Notes |
|---|---|---|
| `type` | `ElementType` | `service` · `database` · `queue` · `frontend` · `external` · `actor` · `group`. The union discriminant. |
| `id` | `Id` | Unique across the document (invariant). |
| `name` | `string` (≥ 1) | |
| `parent` | `Id` | _optional_. Containing element's id. Must exist and not be self (invariants). Drives nested containment. |
| `minLayer` | `LayerId` | `default: "business"`. The shallowest layer this element appears at; it shows at that layer and deeper. |
| `properties` | `ElementProperties` | See below. |
| `lifecycle` | `Lifecycle` | When the element exists in time. See below. |
| `dataSources` | `DataSource[]` | _optional_. Live-data bindings. |
| `style` | `{ tone: Tone }` | _optional_; `tone` `default: "neutral"`. |
| `documentation` | `string` | _optional_. Long-form **markdown**, shown in the inspector's Documentation section. |
| `annotations` | `Annotation[]` | _optional_. Freeform notes (inspector's Annotations section). |

### `group` — extra field

| Field | Type | Notes |
|---|---|---|
| `aggregateAt` | `LayerId[]` | `default: []`. Layers at which this group **collapses** to a single node by default. At other layers it defaults to expanded. The user can override per element with the node chevron. |

### `properties`

A flexible bag. A few keys are known; the rest are type-specific and pass through
untouched (`catchall(unknown)`).

| Key | Type | Notes |
|---|---|---|
| `description` | `string` | _optional_. Shown on the card / inspector. |
| `owner` | `string` | _optional_. Owning team/person. |
| `tags` | `string[]` | _optional_. |
| `_layerVisibility` | `Record<string, LayerId>` | _optional_. Maps a **property key → minimum layer** at which to show it. A key not listed is visible at every layer the element is. |
| *(any other key)* | `unknown` | Type-specific fields (`tech`, `engine`, `framework`, …). Carried through and rendered generically. |

### `lifecycle` — temporal model

| Field | Type | Notes |
|---|---|---|
| `introducedIn` | `MvpRef` | The MVP this thing first appears in. Must reference an existing MVP (invariant). |
| `removedIn` | `MvpRef` | _optional_. The MVP it disappears in. Must reference an existing MVP (invariant). |
| `modifiedIn` | `Record<MvpRef, { properties }>` | _optional_. Per-MVP **property diffs**. Each referenced MVP must exist (invariant). |

**Resolution.** The state at MVP-N is: base `properties`, then apply every
`modifiedIn[mvp].properties` patch whose MVP **order ≤ N** (in order). Storing
only the diff keeps the document light and diffable. An element is *visible* at
MVP-N when `introducedIn.order ≤ N` and (`removedIn` is unset or
`removedIn.order > N`).

### `dataSources[]` — live data

Discriminated union on `kind`. Two flavours: `http` is polled live; `grafana` /
`jira` are link buttons that open a page in a new tab (nothing is fetched).

Every `url` must be a **public http(s) endpoint** (`SafeHttpUrl`): non-http(s)
protocols and loopback / private / link-local / cloud-metadata hosts are
rejected at parse time.

`binding` (`DataBinding`, `http` only): `status` · `badge` · `metric` · `label`.

| `kind` | Fields | Notes |
|---|---|---|
| `grafana` | `url: SafeHttpUrl`, `label?: string` | Renders a button that opens the dashboard in a new tab. Not fetched. |
| `jira` | `url: SafeHttpUrl`, `label?: string` | Renders a button that opens the board/filter in a new tab. Not fetched. |
| `http` | `url: SafeHttpUrl`, `jsonPath?: string`, `binding` | Fetched directly from the browser — **only after the user opts in** per project. |

`http` polling is off by default on every load (an untrusted document never
auto-fetches); the inspector's Live status section has the opt-in. Failures
degrade to a stale marker, never a crash. See `docs/adr/0005-live-data.md` and
`docs/adr/0008-live-data-hardening.md`.

### `annotations[]`

| Field | Type | Notes |
|---|---|---|
| `id` | `Id` | |
| `body` | `string` (≥ 1) | Plain text in v1. |
| `author` | `string` | _optional_. Free text until there's a real identity system. |
| `createdAt` | `string` (≥ 1) | ISO-8601 timestamp. |

---

## `connections[]`

| Field | Type | Notes |
|---|---|---|
| `id` | `Id` | |
| `from` | `Id` | Source element id. Must exist (invariant). |
| `to` | `Id` | Target element id. Must exist (invariant). |
| `type` | `ConnectionType` | `sync` · `async` · `event` · `data`. |
| `protocol` | `string` | _optional_. e.g. `gRPC`, `HTTP`, `Kafka`. |
| `minLayer` | `LayerId` | `default: "architecture"` — note this differs from an element's `business` default; connections are an architecture-and-deeper concern by default. |
| `lifecycle` | `Lifecycle` | Same temporal model as elements. |
| `style` | `{ tone: Tone }` | _optional_; `tone` `default: "neutral"`. |

---

## `tours[]`

| Field | Type | Notes |
|---|---|---|
| `id` | `Id` | |
| `name` | `string` (≥ 1) | |
| `description` | `string` | _optional_ |
| `steps` | `TourStep[]` (≥ 1) | At least one step. |

### `TourStep`

| Field | Type | Notes |
|---|---|---|
| `id` | `Id` | |
| `viewpoint` | `Viewpoint` | Camera target for this step. |
| `caption` | `string` | _optional_. The step's explanatory text. |
| `highlight` | `Id[]` | _optional_. Elements to keep lit; everything else dims. |
| `duration` | positive integer | `default: 4000` (ms) for auto-advance. |

### `Viewpoint`

All fields _optional_; omit to inherit from the previous step. The camera
resolver (`resolveCameraAction`) interprets them in priority order.

| Field | Type | Notes |
|---|---|---|
| `x`, `y` | `number` | Explicit camera coordinates. |
| `focus` | `Id` | Frame this element. |
| `fit` | `all` \| `focus` | Fit-all or fit-the-focus shortcut. |
| `zoom` | `number > 0` | 1 = default, > 1 closer, < 1 farther. |
| `layer` | `LayerId` | Switch layer for this step. |
| `mvp` | `MvpRef` | Switch MVP for this step. |

See `docs/adr/0004-tour-playback.md`.

---

## `layout` — per-layer manual overrides

Optional. Stores only **manual** placements; auto-layout output is never
persisted (it's recomputed at runtime). See
`docs/adr/0011-per-layer-overrides.md`.

```yaml
layout:
  business:     { <elementId>: { position?, size? }, … }   # all optional
  architecture: { … }
  engineering:  { … }
```

- Each layer key is _optional_; omitting one means full auto-layout for that
  layer.
- Within a layer, each element id is _optional_; omitting one means that element
  auto-lays-out at that layer.
- `position` is `{ x, y }`, stored **parent-relative**. `size` is `{ w>0, h>0 }`
  (reserved; v1 writes only `position`).

---

## Cross-field invariants

Enforced by `superRefine` **after** shape validation. Any failure rejects the
whole document.

1. **Unique element ids** — no two elements share an `id`.
2. **No self-parenting** — `element.parent !== element.id`.
3. **Parent exists** — every `parent` references an element in the document.
4. **Connection endpoints exist** — every connection `from` / `to` references an
   existing element.
5. **Lifecycle MVPs exist** — for every element and connection, `introducedIn`,
   `removedIn`, and every `modifiedIn` key reference an MVP declared in `mvps`.

---

## Defaults at a glance

| Field | Default |
|---|---|
| `project.theme` | `"default"` |
| `connections` (root) | `[]` |
| `element.minLayer` | `"business"` |
| `connection.minLayer` | `"architecture"` |
| `group.aggregateAt` | `[]` |
| `style.tone` | `"neutral"` |
| `tourStep.duration` | `4000` (ms) |

---

## Authoring by hand

Write YAML, then let the app validate it — the parser is the contract, and its
error messages name the offending path. Start from `docs/schema-example.yaml`,
keep ids kebab-case, declare every MVP you reference in a lifecycle, and remember
the two differing `minLayer` defaults above. When in doubt, the precise rule is
in `packages/schema/src/schema.ts`.
