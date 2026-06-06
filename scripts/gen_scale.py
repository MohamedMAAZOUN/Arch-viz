#!/usr/bin/env python3
"""
Generate a large synthetic arch-vis project for layout & performance testing.

Unlike the hand-built Aurora example, this is parametric: pass a target element
count and it builds a believable-shaped topology (domains → services → data
stores + queues, with cross-domain calls and realistic fan-out) at that scale.

The shape matters: random graphs don't stress a layered layout engine the way
real architectures do. We model:
  - N domains (aggregation groups)
  - services clustered under domains
  - each service backed by 0-2 data stores / queues
  - intra-domain call chains + cross-domain edges (the hard part for ELK)
  - MVP lifecycle spread across the timeline
  - a slice of elements carrying data sources and non-neutral tones

Usage:
    python3 gen_scale.py [N]          # N = target element count (default 300)
    python3 gen_scale.py 300 > big.yaml

Determinism: a fixed seed makes output reproducible for comparable benchmarks.
"""

import sys
import random
import yaml

random.seed(42)  # reproducible benchmarks

TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 300

# ---------------------------------------------------------------------------
# Fixed scaffolding
# ---------------------------------------------------------------------------
N_MVPS = 6
MVP_COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ec4899",
              "#8b5cf6", "#ef4444", "#14b8a6"]
MVPS = [
    {"id": f"mvp{i}", "name": f"MVP {i}", "order": i,
     "color": MVP_COLORS[(i - 1) % len(MVP_COLORS)]}
    for i in range(1, N_MVPS + 1)
]
LAYERS = [
    {"id": "business", "order": 1, "label": "Business"},
    {"id": "architecture", "order": 2, "label": "Architecture"},
    {"id": "engineering", "order": 3, "label": "Engineering"},
]

TONES = ["neutral", "neutral", "neutral", "critical", "warning", "success", "muted"]
SERVICE_LANGS = ["Go", "Java", "Rust", "Python", "Kotlin", "TypeScript", "C#"]
DB_ENGINES = ["PostgreSQL", "MySQL", "MongoDB", "Cassandra", "Redis", "ClickHouse"]
BROKERS = ["Kafka", "RabbitMQ", "NATS", "Pulsar"]

elements = []
connections = []


def rand_mvp(max_order=N_MVPS):
    """Pick an MVP id, biased toward earlier ones (more foundational mass)."""
    o = min(max_order, 1 + int(random.triangular(0, N_MVPS - 1, 0)))
    return f"mvp{o}"


def add_lifecycle(introduced):
    lc = {"introducedIn": introduced}
    intro_order = int(introduced[3:])
    # ~8% of elements get retired later
    if intro_order < N_MVPS and random.random() < 0.08:
        lc["removedIn"] = f"mvp{random.randint(intro_order + 1, N_MVPS)}"
    # ~12% get a property modification in a later MVP
    if intro_order < N_MVPS and random.random() < 0.12:
        mod_at = random.randint(intro_order + 1, N_MVPS)
        lc["modifiedIn"] = {f"mvp{mod_at}": {"properties": {
            "description": "Updated capability in a later iteration."}}}
    return lc


# ---------------------------------------------------------------------------
# Plan the domain/service/data distribution to hit TARGET elements
# ---------------------------------------------------------------------------
# Rough budget per domain: 1 group + ~6 services + ~4 data/queue + 1 frontend.
# ≈ 12 elements/domain. Plus a handful of global actors/externals.
PER_DOMAIN = 12
N_DOMAINS = max(3, round((TARGET - 8) / PER_DOMAIN))

domain_ids = []
for d in range(N_DOMAINS):
    did = f"domain-{d:02d}"
    domain_ids.append(did)
    intro = f"mvp{min(N_MVPS, 1 + d % N_MVPS)}"
    elements.append({
        "id": did, "type": "group", "name": f"Domain {d:02d}",
        "minLayer": "business", "aggregateAt": ["business"],
        "properties": {"description": f"Bounded context #{d}.",
                       "tags": ["domain"]},
        "lifecycle": {"introducedIn": intro},
    })

# Global actors (business layer)
N_ACTORS = min(6, max(3, N_DOMAINS // 3))
for a in range(N_ACTORS):
    elements.append({
        "id": f"actor-{a:02d}", "type": "actor", "name": f"Persona {a:02d}",
        "minLayer": "business",
        "properties": {"description": "A system user.", "tags": ["persona"]},
        "lifecycle": {"introducedIn": "mvp1"},
    })

# Global externals
N_EXTERNAL = min(8, max(2, N_DOMAINS // 2))
external_ids = []
for x in range(N_EXTERNAL):
    xid = f"external-{x:02d}"
    external_ids.append(xid)
    elements.append({
        "id": xid, "type": "external", "name": f"3rd-Party {x:02d}",
        "minLayer": "architecture",
        "properties": {"description": "External provider.",
                       "tags": ["third-party"]},
        "lifecycle": {"introducedIn": rand_mvp()},
    })

# ---------------------------------------------------------------------------
# Populate each domain
# ---------------------------------------------------------------------------
all_service_ids = []
domain_services = {}

for d, did in enumerate(domain_ids):
    domain_intro_order = 1 + d % N_MVPS
    svc_ids = []

    # one frontend per domain (~60% of domains)
    if random.random() < 0.6:
        fid = f"fe-{d:02d}"
        elements.append({
            "id": fid, "type": "frontend", "name": f"App {d:02d}",
            "parent": did, "minLayer": "business",
            "properties": {"description": "Domain UI.",
                           "owner": f"team-{d:02d}", "tags": ["spa"],
                           "tech": {"framework": random.choice(
                               ["React", "Vue", "Next.js", "Svelte"])}},
            "lifecycle": add_lifecycle(f"mvp{domain_intro_order}"),
        })

    # services
    n_services = random.randint(4, 8)
    for s in range(n_services):
        sid = f"svc-{d:02d}-{s:02d}"
        svc_ids.append(sid)
        all_service_ids.append(sid)
        intro = f"mvp{min(N_MVPS, domain_intro_order + random.randint(0, 2))}"
        ds = None
        # ~20% of services expose a data source
        if random.random() < 0.20:
            kind = random.choice(["grafana", "jira", "http"])
            if kind == "grafana":
                # grafana/jira are link buttons (open a page), not polled live.
                ds = [{"kind": "grafana",
                       "url": f"https://grafana.example.com/d/svc-{d}-{s}-rps",
                       "label": f"svc_{d}_{s}_rps"}]
            elif kind == "jira":
                ds = [{"kind": "jira",
                       "url": f"https://jira.example.com/issues/?jql=project%3DD{d}%20AND%20status%3DOpen",
                       "label": f"project=D{d} AND status=Open"}]
            else:
                ds = [{"kind": "http",
                       "url": f"https://status.example.com/svc/{d}/{s}",
                       "binding": "status"}]
        el = {
            "id": sid, "type": "service", "name": f"Service {d:02d}-{s:02d}",
            "parent": did, "minLayer": "architecture",
            "properties": {"description": f"Service {s} in domain {d}.",
                           "owner": f"team-{d:02d}",
                           "tech": {"language": random.choice(SERVICE_LANGS),
                                    "runtime": "Kubernetes"}},
            "lifecycle": add_lifecycle(intro),
            "style": {"tone": random.choice(TONES)},
        }
        if ds:
            el["dataSources"] = ds
        elements.append(el)

    # data stores + queues (engineering layer)
    n_data = random.randint(2, 5)
    for q in range(n_data):
        is_queue = random.random() < 0.35
        if is_queue:
            elements.append({
                "id": f"q-{d:02d}-{q:02d}", "type": "queue",
                "name": f"Queue {d:02d}-{q:02d}", "parent": did,
                "minLayer": "engineering",
                "properties": {"description": "Async message channel.",
                               "owner": f"team-{d:02d}",
                               "tech": {"broker": random.choice(BROKERS)}},
                "lifecycle": add_lifecycle(f"mvp{domain_intro_order}"),
            })
        else:
            elements.append({
                "id": f"db-{d:02d}-{q:02d}", "type": "database",
                "name": f"Store {d:02d}-{q:02d}", "parent": did,
                "minLayer": "engineering",
                "properties": {"description": "Persistent store.",
                               "owner": f"team-{d:02d}",
                               "tech": {"engine": random.choice(DB_ENGINES)}},
                "lifecycle": add_lifecycle(f"mvp{domain_intro_order}"),
            })

    domain_services[did] = svc_ids

# ---------------------------------------------------------------------------
# Connections — the part that actually stresses the layout
# ---------------------------------------------------------------------------
data_ids = [e["id"] for e in elements if e["type"] in ("database", "queue")]
data_by_domain = {}
for e in elements:
    if e["type"] in ("database", "queue"):
        data_by_domain.setdefault(e.get("parent"), []).append(e["id"])

cid = 0
def next_cid():
    global cid
    cid += 1
    return f"c-{cid:04d}"


def el_intro_order(eid):
    for e in elements:
        if e["id"] == eid:
            return int(e["lifecycle"]["introducedIn"][3:])
    return 1


def safe_intro(a, b):
    """An edge can't predate either endpoint."""
    return f"mvp{max(el_intro_order(a), el_intro_order(b))}"


# Intra-domain: service call chains + service→data edges
for did, svc_ids in domain_services.items():
    # chain services within the domain
    for i in range(len(svc_ids) - 1):
        if random.random() < 0.6:
            a, b = svc_ids[i], svc_ids[i + 1]
            connections.append({
                "id": next_cid(), "from": a, "to": b, "type": "sync",
                "protocol": "gRPC", "minLayer": "architecture",
                "lifecycle": {"introducedIn": safe_intro(a, b)},
            })
    # service → data store in the same domain
    dstores = data_by_domain.get(did, [])
    for sid in svc_ids:
        for dstore in random.sample(dstores, min(len(dstores),
                                                  random.randint(0, 2))):
            is_q = dstore.startswith("q-")
            connections.append({
                "id": next_cid(), "from": sid, "to": dstore,
                "type": "event" if is_q else "data",
                "protocol": "Kafka" if is_q else "SQL",
                "minLayer": "engineering",
                "lifecycle": {"introducedIn": safe_intro(sid, dstore)},
            })

# Cross-domain edges — the hard layout case (long edges between clusters)
n_cross = int(len(all_service_ids) * 0.4)
for _ in range(n_cross):
    a, b = random.sample(all_service_ids, 2)
    # avoid same-domain (those are handled above)
    if a.split("-")[1] == b.split("-")[1]:
        continue
    connections.append({
        "id": next_cid(), "from": a, "to": b,
        "type": random.choice(["sync", "async", "event"]),
        "protocol": random.choice(["gRPC", "HTTPS", "Kafka"]),
        "minLayer": "architecture",
        "lifecycle": {"introducedIn": safe_intro(a, b)},
    })

# Some services → externals
for xid in external_ids:
    for sid in random.sample(all_service_ids,
                             min(len(all_service_ids), random.randint(1, 3))):
        connections.append({
            "id": next_cid(), "from": sid, "to": xid, "type": "sync",
            "protocol": "HTTPS", "minLayer": "architecture",
            "lifecycle": {"introducedIn": safe_intro(sid, xid)},
        })

# Actors → frontends (or services if no frontend)
frontend_ids = [e["id"] for e in elements if e["type"] == "frontend"]
actor_ids = [e["id"] for e in elements if e["type"] == "actor"]
targets = frontend_ids if frontend_ids else all_service_ids
for aid in actor_ids:
    for t in random.sample(targets, min(len(targets), random.randint(1, 3))):
        connections.append({
            "id": next_cid(), "from": aid, "to": t, "type": "sync",
            "protocol": "HTTPS", "minLayer": "business",
            "lifecycle": {"introducedIn": safe_intro(aid, t)},
        })

doc = {
    "$schemaVersion": "1.0.0",
    "project": {
        "id": "scale-test",
        "name": f"Scale Test ({len(elements)} elements)",
        "description": f"Synthetic {len(elements)}-element project for layout "
                       f"and performance benchmarking. Seed=42.",
        "theme": "default",
    },
    "mvps": MVPS,
    "layers": LAYERS,
    "elements": elements,
    "connections": connections,
}

if __name__ == "__main__":
    yaml.dump(doc, sys.stdout, sort_keys=False, default_flow_style=False,
              width=100, allow_unicode=True)
    print(f"\n# target={TARGET}  actual elements={len(elements)}  "
          f"connections={len(connections)}  domains={N_DOMAINS}",
          file=sys.stderr)
