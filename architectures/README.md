# architectures/

Every `*.yaml` file in this folder is a bundled **architecture** that ships with
the app. The catalog is auto-discovered at build time — there is no registry to
edit.

## Adding an architecture

1. Drop a `<name>.yaml` file in this folder. The filename (without extension)
   becomes its stable id.
2. Make sure it validates against the project schema (`src/core/schema/`). The
   app parses it through the schema trust boundary when opened.

That's it. The new file appears automatically in:

- the **⌘K / Ctrl-K** architecture switcher (searchable by architecture name
  **and** by the names of the nodes inside it), and
- the **Architectures** list in Settings.

## How it works

`src/data/architectures.ts` discovers these files via Vite's `import.meta.glob`
and builds a cached search index (`{ name, description, elementCount, nodeNames }`)
the first time the picker or Settings is opened. The raw YAML for each
architecture is fetched on demand (its own chunk), so large fixtures stay out of
the main bundle until selected.

The default architecture seeded on a fresh start is `example-project.yaml`
(`DEFAULT_ARCHITECTURE_ID` in `src/data/architectures.ts`).
