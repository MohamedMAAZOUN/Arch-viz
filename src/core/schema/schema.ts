// ============================================================================
// Architecture Visualizer — Zod schema v1.0.0
// ============================================================================
// Zod definitions for the project document. The runtime model is JSON;
// the YAML on disk is parsed once and validated against these schemas.
//
// Validation is the gate between "string from disk" and "trusted model in
// memory". If parse() throws, the file is rejected — never partially loaded.
// ============================================================================

import { z } from "zod";

// ----------------------------------------------------------------------------
// Primitives
// ----------------------------------------------------------------------------

export const Id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, {
    message: "ids are kebab-case: lowercase letters, digits, dashes, underscores",
  });
export type Id = z.infer<typeof Id>;

export const MvpRef = z.string().regex(/^mvp\d+$/, "MVP id must match mvpN");
export type MvpRef = z.infer<typeof MvpRef>;

export const LayerId = z.enum(["business", "architecture", "engineering"]);
export type LayerId = z.infer<typeof LayerId>;

export const Tone = z.enum(["neutral", "critical", "warning", "success", "muted"]);
export type Tone = z.infer<typeof Tone>;

export const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// ----------------------------------------------------------------------------
// Project / MVPs / Layers
// ----------------------------------------------------------------------------

export const Project = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().optional(),
  theme: z.string().default("default"),
});
export type Project = z.infer<typeof Project>;

export const Mvp = z.object({
  id: MvpRef,
  name: z.string().min(1),
  order: z.number().int().positive(),
  color: HexColor,
});
export type Mvp = z.infer<typeof Mvp>;

export const Layer = z.object({
  id: LayerId,
  order: z.number().int().positive(),
  label: z.string().min(1),
});
export type Layer = z.infer<typeof Layer>;

// ----------------------------------------------------------------------------
// Lifecycle (temporal)
// ----------------------------------------------------------------------------
// `modifiedIn` stores only the diff per MVP. The resolved state at MVP-N is
// computed by: base properties + apply every modifiedIn entry whose MVP order
// is ≤ N. This keeps the document light and diffable.

export const PropertyPatch = z.record(z.string(), z.unknown());

export const Lifecycle = z.object({
  introducedIn: MvpRef,
  removedIn: MvpRef.optional(),
  modifiedIn: z.record(MvpRef, z.object({ properties: PropertyPatch })).optional(),
});
export type Lifecycle = z.infer<typeof Lifecycle>;

// ----------------------------------------------------------------------------
// Data sources (live data hooks — the killer feature)
// ----------------------------------------------------------------------------
// A node can subscribe to real data. The `binding` slot determines how the
// value is rendered on the node. Limited set, predictable visuals.

export const DataBinding = z.enum(["status", "badge", "metric", "label"]);
export type DataBinding = z.infer<typeof DataBinding>;

export const GrafanaSource = z.object({
  kind: z.literal("grafana"),
  query: z.string().min(1),
  binding: DataBinding,
});

export const JiraSource = z.object({
  kind: z.literal("jira"),
  jql: z.string().min(1),
  binding: DataBinding,
});

export const HttpSource = z.object({
  kind: z.literal("http"),
  url: z.url(),
  jsonPath: z.string().optional(),
  binding: DataBinding,
});

export const DataSource = z.discriminatedUnion("kind", [GrafanaSource, JiraSource, HttpSource]);
export type DataSource = z.infer<typeof DataSource>;

// ----------------------------------------------------------------------------
// Element properties
// ----------------------------------------------------------------------------
// `_layerVisibility` maps a property *key* → minimum layer to show it at.
// Keys not listed are visible at every layer where the element itself is.

export const ElementProperties = z
  .object({
    description: z.string().optional(),
    owner: z.string().optional(),
    tags: z.array(z.string()).optional(),
    _layerVisibility: z.record(z.string(), LayerId).optional(),
  })
  .catchall(z.unknown()); // type-specific fields (tech, engine, framework, ...)
export type ElementProperties = z.infer<typeof ElementProperties>;

// ----------------------------------------------------------------------------
// Elements (discriminated union on `type`)
// ----------------------------------------------------------------------------
// Core types are fixed in v1. Custom types via `customTypes` block — v2.

export const ElementType = z.enum([
  "service",
  "database",
  "queue",
  "frontend",
  "external",
  "actor",
  "group",
]);
export type ElementType = z.infer<typeof ElementType>;

const elementCommonShape = {
  id: Id,
  name: z.string().min(1),
  parent: Id.optional(),
  minLayer: LayerId.default("business"),
  properties: ElementProperties,
  lifecycle: Lifecycle,
  dataSources: z.array(DataSource).optional(),
  style: z.object({ tone: Tone.default("neutral") }).optional(),
};

export const Element = z.discriminatedUnion("type", [
  z.object({ type: z.literal("service"), ...elementCommonShape }),
  z.object({ type: z.literal("database"), ...elementCommonShape }),
  z.object({ type: z.literal("queue"), ...elementCommonShape }),
  z.object({ type: z.literal("frontend"), ...elementCommonShape }),
  z.object({ type: z.literal("external"), ...elementCommonShape }),
  z.object({ type: z.literal("actor"), ...elementCommonShape }),
  // Group has the extra `aggregateAt` field — controls layer-driven aggregation.
  z.object({
    type: z.literal("group"),
    aggregateAt: z.array(LayerId).default([]),
    ...elementCommonShape,
  }),
]);
export type Element = z.infer<typeof Element>;

// ----------------------------------------------------------------------------
// Connections (edges)
// ----------------------------------------------------------------------------

export const ConnectionType = z.enum(["sync", "async", "event", "data"]);
export type ConnectionType = z.infer<typeof ConnectionType>;

export const Connection = z.object({
  id: Id,
  from: Id,
  to: Id,
  type: ConnectionType,
  protocol: z.string().optional(),
  minLayer: LayerId.default("architecture"),
  lifecycle: Lifecycle,
  style: z.object({ tone: Tone.default("neutral") }).optional(),
});
export type Connection = z.infer<typeof Connection>;

// ----------------------------------------------------------------------------
// Tours (the narrative / Prezi-feel)
// ----------------------------------------------------------------------------

export const Viewpoint = z.object({
  // Either explicit coordinates...
  x: z.number().optional(),
  y: z.number().optional(),
  // ...or a focus target (element id) the camera frames.
  focus: Id.optional(),
  // ...or a "fit all" / "fit focus" shortcut.
  fit: z.enum(["all", "focus"]).optional(),
  // Camera zoom level (1 = default, >1 closer, <1 farther).
  zoom: z.number().positive().optional(),
  // Per-step context overrides. Omit to inherit from previous step.
  layer: LayerId.optional(),
  mvp: MvpRef.optional(),
});
export type Viewpoint = z.infer<typeof Viewpoint>;

export const TourStep = z.object({
  id: Id,
  viewpoint: Viewpoint,
  caption: z.string().optional(),
  highlight: z.array(Id).optional(),
  duration: z.number().int().positive().default(4000), // ms
});
export type TourStep = z.infer<typeof TourStep>;

export const Tour = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(TourStep).min(1),
});
export type Tour = z.infer<typeof Tour>;

// ----------------------------------------------------------------------------
// Layout (per-layer manual position overrides)
// ----------------------------------------------------------------------------
// Positions are stored per layer (rule #2 of position calculation). Only
// manual overrides — auto-layout output is recomputed at runtime and never
// persisted. "Reorganize" wipes the entries for the current layer.

export const Position = z.object({ x: z.number(), y: z.number() });
export const Size = z.object({ w: z.number().positive(), h: z.number().positive() });

export const ElementLayout = z.object({
  position: Position.optional(),
  size: Size.optional(),
});

// Each layer key is optional — omitting a layer means full auto-layout
// for that layer. Within a layer, each element id is optional too.
export const PerLayerLayout = z.object({
  business: z.record(Id, ElementLayout).optional(),
  architecture: z.record(Id, ElementLayout).optional(),
  engineering: z.record(Id, ElementLayout).optional(),
});
export type PerLayerLayout = z.infer<typeof PerLayerLayout>;

// ----------------------------------------------------------------------------
// Root document
// ----------------------------------------------------------------------------

export const ProjectDocument = z
  .object({
    $schemaVersion: z.literal("1.0.0"),
    project: Project,
    mvps: z.array(Mvp).min(1),
    layers: z.array(Layer).length(3),
    elements: z.array(Element),
    connections: z.array(Connection).default([]),
    tours: z.array(Tour).optional(),
    layout: PerLayerLayout.optional(),
  })
  // Cross-field invariants enforced after shape validation.
  .superRefine((doc, ctx) => {
    const elementIds = new Set(doc.elements.map((e) => e.id));
    const mvpIds = new Set(doc.mvps.map((m) => m.id));

    // Unique element ids
    if (elementIds.size !== doc.elements.length) {
      ctx.addIssue({
        code: "custom",
        message: "duplicate element id",
        path: ["elements"],
      });
    }

    // parent must exist and not be self
    for (const el of doc.elements) {
      if (el.parent && el.parent === el.id) {
        ctx.addIssue({
          code: "custom",
          message: `element ${el.id} is its own parent`,
          path: ["elements"],
        });
      }
      if (el.parent && !elementIds.has(el.parent)) {
        ctx.addIssue({
          code: "custom",
          message: `element ${el.id} references unknown parent ${el.parent}`,
          path: ["elements"],
        });
      }
    }

    // connections must reference existing elements
    for (const c of doc.connections) {
      if (!elementIds.has(c.from)) {
        ctx.addIssue({
          code: "custom",
          message: `connection ${c.id}: unknown 'from' ${c.from}`,
          path: ["connections"],
        });
      }
      if (!elementIds.has(c.to)) {
        ctx.addIssue({
          code: "custom",
          message: `connection ${c.id}: unknown 'to' ${c.to}`,
          path: ["connections"],
        });
      }
    }

    // lifecycle references must point to existing MVPs
    const checkLifecycle = (lc: Lifecycle, where: string) => {
      if (!mvpIds.has(lc.introducedIn)) {
        ctx.addIssue({
          code: "custom",
          message: `${where}: introducedIn references unknown mvp ${lc.introducedIn}`,
          path: [where],
        });
      }
      if (lc.removedIn && !mvpIds.has(lc.removedIn)) {
        ctx.addIssue({
          code: "custom",
          message: `${where}: removedIn references unknown mvp ${lc.removedIn}`,
          path: [where],
        });
      }
      if (lc.modifiedIn) {
        for (const mvp of Object.keys(lc.modifiedIn)) {
          if (!mvpIds.has(mvp)) {
            ctx.addIssue({
              code: "custom",
              message: `${where}: modifiedIn references unknown mvp ${mvp}`,
              path: [where],
            });
          }
        }
      }
    };
    doc.elements.forEach((e) => {
      checkLifecycle(e.lifecycle, `element:${e.id}`);
    });
    doc.connections.forEach((c) => {
      checkLifecycle(c.lifecycle, `connection:${c.id}`);
    });
  });

export type ProjectDocument = z.infer<typeof ProjectDocument>;

// ----------------------------------------------------------------------------
// Parse helper — single entry point for loading
// ----------------------------------------------------------------------------

export function parseProjectDocument(raw: unknown): ProjectDocument {
  return ProjectDocument.parse(raw);
}
