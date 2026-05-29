# Scripts

Utility scripts for arch-vis development. Not part of the app bundle.

## Example generators

Both emit schema-valid YAML to stdout. Requires Python 3 + PyYAML
(`pip install pyyaml`).

### `gen_realistic.py`

Generates the **Aurora Platform** example — a hand-modeled, believable fintech
platform (~42 elements) spanning banking, payments, lending, and ML across five
quarters. Exercises every schema feature: all element types, all connection
types, aggregation groups, per-layer minimums, MVP lifecycle (introduce /
modify / remove), data sources, tones, and guided tours.

```bash
python3 scripts/gen_realistic.py > src/data/aurora-platform.yaml
```

### `gen_scale.py`

Generates a **parametric synthetic project** at a target element count, with
realistic topology (domains → services → data stores + queues, intra- and
cross-domain edges). For layout and performance benchmarking. Seeded for
reproducible output.

```bash
python3 scripts/gen_scale.py 100 > src/data/scale-test-100.yaml
python3 scripts/gen_scale.py 300 > src/data/scale-test-300.yaml
```

After generating, validate against the live schema before committing:

```bash
# from the repo root, with a small validation script:
npx vite-node scripts/validate.mjs src/data/scale-test-300.yaml
```

## Registering a new example

Add the generated file to the registry in `src/data/examples.ts` with a lazy
`load()` entry, so it appears in Settings → Example projects.
