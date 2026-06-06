#!/usr/bin/env python3
"""
Generate a realistic enterprise-platform example for arch-vis.

This produces a believable ~55-element fintech-style platform ("Aurora") that
exercises every schema feature: all 7 element types, all 4 connection types,
aggregation groups, per-layer minimums, MVP lifecycle (introduce / modify /
remove), data sources, tones, and a couple of guided tours.

Output: realistic YAML printed to stdout (pipe to a file).
"""

import yaml
import sys


# ---------------------------------------------------------------------------
# MVPs — five quarters of evolution
# ---------------------------------------------------------------------------
MVPS = [
    {"id": "mvp1", "name": "Q1 · Foundation", "order": 1, "color": "#6366f1"},
    {"id": "mvp2", "name": "Q2 · Payments", "order": 2, "color": "#06b6d4"},
    {"id": "mvp3", "name": "Q3 · Lending", "order": 3, "color": "#10b981"},
    {"id": "mvp4", "name": "Q4 · Intelligence", "order": 4, "color": "#f59e0b"},
    {"id": "mvp5", "name": "Q5 · Scale", "order": 5, "color": "#ec4899"},
]

LAYERS = [
    {"id": "business", "order": 1, "label": "Business"},
    {"id": "architecture", "order": 2, "label": "Architecture"},
    {"id": "engineering", "order": 3, "label": "Engineering"},
]


def el(id, type, name, introduced, **kw):
    """Build an element with sensible defaults."""
    props = kw.pop("properties", {})
    e = {
        "id": id,
        "type": type,
        "name": name,
        "minLayer": kw.pop("minLayer", "architecture"),
        "properties": props,
        "lifecycle": {"introducedIn": introduced, **kw.pop("lifecycle", {})},
    }
    if "parent" in kw:
        e["parent"] = kw.pop("parent")
    if "dataSources" in kw:
        e["dataSources"] = kw.pop("dataSources")
    if "tone" in kw:
        e["style"] = {"tone": kw.pop("tone")}
    if type == "group":
        e["aggregateAt"] = kw.pop("aggregateAt", [])
    return e


def conn(id, frm, to, type, introduced, **kw):
    c = {
        "id": id,
        "from": frm,
        "to": to,
        "type": type,
        "minLayer": kw.pop("minLayer", "architecture"),
        "lifecycle": {"introducedIn": introduced, **kw.pop("lifecycle", {})},
    }
    if "protocol" in kw:
        c["protocol"] = kw.pop("protocol")
    if "tone" in kw:
        c["style"] = {"tone": kw.pop("tone")}
    return c


elements = []
connections = []

# ---------------------------------------------------------------------------
# Actors (business layer) — who uses the system
# ---------------------------------------------------------------------------
elements += [
    el("customer", "actor", "Retail Customer", "mvp1", minLayer="business",
       properties={"description": "End user managing accounts and payments.",
                   "tags": ["external", "persona"]}),
    el("merchant", "actor", "Merchant", "mvp2", minLayer="business",
       properties={"description": "Business accepting payments.",
                   "tags": ["external", "persona"]}),
    el("ops-analyst", "actor", "Operations Analyst", "mvp1", minLayer="business",
       properties={"description": "Internal staff monitoring platform health.",
                   "tags": ["internal", "persona"]}),
    el("risk-officer", "actor", "Risk Officer", "mvp3", minLayer="business",
       properties={"description": "Reviews lending decisions and fraud flags.",
                   "tags": ["internal", "persona"]}),
]

# ---------------------------------------------------------------------------
# Domain groups (the business-layer aggregation boxes)
# ---------------------------------------------------------------------------
elements += [
    el("banking-domain", "group", "Core Banking", "mvp1", minLayer="business",
       aggregateAt=["business"],
       properties={"description": "Accounts, ledger, and customer identity.",
                   "tags": ["domain"]}),
    el("payments-domain", "group", "Payments", "mvp2", minLayer="business",
       aggregateAt=["business"],
       properties={"description": "Money movement and settlement.",
                   "tags": ["domain"]}),
    el("lending-domain", "group", "Lending", "mvp3", minLayer="business",
       aggregateAt=["business"],
       properties={"description": "Credit decisioning and loan servicing.",
                   "tags": ["domain"]}),
    el("intelligence-domain", "group", "Intelligence", "mvp4", minLayer="business",
       aggregateAt=["business"],
       properties={"description": "ML-driven fraud, risk, and personalization.",
                   "tags": ["domain"]}),
    el("platform-domain", "group", "Shared Platform", "mvp1", minLayer="business",
       aggregateAt=["business"],
       properties={"description": "Cross-cutting infrastructure services.",
                   "tags": ["domain"]}),
]

# ---------------------------------------------------------------------------
# Frontends
# ---------------------------------------------------------------------------
elements += [
    el("web-app", "frontend", "Web Banking App", "mvp1", parent="banking-domain",
       minLayer="business",
       properties={"description": "React SPA for retail banking.",
                   "owner": "team-web", "tags": ["spa"],
                   "tech": {"framework": "React", "hosting": "CloudFront"}},
       tone="neutral"),
    el("mobile-app", "frontend", "Mobile App", "mvp1", parent="banking-domain",
       minLayer="business",
       properties={"description": "iOS / Android banking client.",
                   "owner": "team-mobile", "tags": ["mobile"],
                   "tech": {"framework": "React Native"}}),
    el("merchant-portal", "frontend", "Merchant Portal", "mvp2",
       parent="payments-domain", minLayer="business",
       properties={"description": "Dashboard for merchants.",
                   "owner": "team-merchant", "tags": ["spa"],
                   "tech": {"framework": "Next.js"}}),
    el("ops-console", "frontend", "Ops Console", "mvp1", parent="platform-domain",
       properties={"description": "Internal operations dashboard.",
                   "owner": "team-platform", "tags": ["internal"]}),
]

# ---------------------------------------------------------------------------
# Core banking services + data
# ---------------------------------------------------------------------------
elements += [
    el("api-gateway", "service", "API Gateway", "mvp1", parent="platform-domain",
       properties={"description": "Edge routing, auth, rate limiting.",
                   "owner": "team-platform", "tags": ["edge", "critical"],
                   "tech": {"language": "Go", "runtime": "Kubernetes"}},
       tone="critical",
       dataSources=[{"kind": "grafana", "url": "https://grafana.example.com/d/gateway/gateway-rps", "label": "Gateway RPS"}]),
    el("auth-service", "service", "Identity & Auth", "mvp1", parent="banking-domain",
       properties={"description": "OAuth2 / OIDC, session management.",
                   "owner": "team-identity", "tags": ["security", "critical"],
                   "tech": {"language": "Go"}},
       tone="critical"),
    el("account-service", "service", "Account Service", "mvp1",
       parent="banking-domain",
       properties={"description": "Account lifecycle and balances.",
                   "owner": "team-banking", "tags": ["core"],
                   "tech": {"language": "Java", "framework": "Spring Boot"}},
       lifecycle={"modifiedIn": {"mvp4": {"properties": {
           "description": "Account lifecycle, balances, and ML-scored insights."}}}}),
    el("ledger-service", "service", "Ledger Service", "mvp1",
       parent="banking-domain",
       properties={"description": "Double-entry transaction ledger.",
                   "owner": "team-banking", "tags": ["core", "critical"],
                   "tech": {"language": "Rust"}},
       tone="critical"),
    el("customer-db", "database", "Customer DB", "mvp1", parent="banking-domain",
       minLayer="engineering",
       properties={"description": "PostgreSQL — customer & account records.",
                   "owner": "team-banking", "tags": ["postgres"],
                   "tech": {"engine": "PostgreSQL", "ha": "multi-AZ"}}),
    el("ledger-db", "database", "Ledger DB", "mvp1", parent="banking-domain",
       minLayer="engineering",
       properties={"description": "Append-only ledger store.",
                   "owner": "team-banking", "tags": ["postgres", "critical"],
                   "tech": {"engine": "PostgreSQL"}},
       tone="critical"),
]

# ---------------------------------------------------------------------------
# Payments (mvp2)
# ---------------------------------------------------------------------------
elements += [
    el("payment-service", "service", "Payment Service", "mvp2",
       parent="payments-domain",
       properties={"description": "Initiates and tracks payments.",
                   "owner": "team-payments", "tags": ["core"],
                   "tech": {"language": "Java"}},
       dataSources=[{"kind": "jira",
                     "url": "https://jira.example.com/issues/?jql=project%3DPAY%20AND%20status%3DOpen",
                     "label": "Open PAY issues"}]),
    el("settlement-service", "service", "Settlement Service", "mvp2",
       parent="payments-domain",
       properties={"description": "Batch settlement with banking partners.",
                   "owner": "team-payments", "tags": ["batch"],
                   "tech": {"language": "Java"}}),
    el("payment-queue", "queue", "Payment Events", "mvp2",
       parent="payments-domain", minLayer="engineering",
       properties={"description": "Kafka topic for payment lifecycle events.",
                   "owner": "team-payments", "tags": ["kafka"],
                   "tech": {"broker": "Kafka", "partitions": 24}}),
    el("payment-db", "database", "Payment DB", "mvp2", parent="payments-domain",
       minLayer="engineering",
       properties={"description": "Payment records and state machine.",
                   "owner": "team-payments", "tech": {"engine": "PostgreSQL"}}),
    el("card-network", "external", "Card Networks", "mvp2",
       parent="payments-domain",
       properties={"description": "Visa / Mastercard rails.",
                   "tags": ["third-party"]}),
    el("bank-rails", "external", "Banking Rails (ACH/SEPA)", "mvp2",
       parent="payments-domain",
       properties={"description": "Direct bank transfer networks.",
                   "tags": ["third-party"]}),
]

# ---------------------------------------------------------------------------
# Lending (mvp3)
# ---------------------------------------------------------------------------
elements += [
    el("lending-service", "service", "Lending Service", "mvp3",
       parent="lending-domain",
       properties={"description": "Loan origination and servicing.",
                   "owner": "team-lending", "tech": {"language": "Kotlin"}}),
    el("credit-engine", "service", "Credit Decision Engine", "mvp3",
       parent="lending-domain",
       properties={"description": "Rules + ML credit scoring.",
                   "owner": "team-lending", "tags": ["critical"],
                   "tech": {"language": "Python"}},
       tone="warning"),
    el("lending-db", "database", "Lending DB", "mvp3", parent="lending-domain",
       minLayer="engineering",
       properties={"description": "Loan records and repayment schedules.",
                   "owner": "team-lending", "tech": {"engine": "PostgreSQL"}}),
    el("credit-bureau", "external", "Credit Bureau", "mvp3",
       parent="lending-domain",
       properties={"description": "External credit-history provider.",
                   "tags": ["third-party"]}),
]

# ---------------------------------------------------------------------------
# Intelligence (mvp4) — ML services
# ---------------------------------------------------------------------------
elements += [
    el("fraud-service", "service", "Fraud Detection", "mvp4",
       parent="intelligence-domain",
       properties={"description": "Real-time transaction fraud scoring.",
                   "owner": "team-ml", "tags": ["ml", "critical"],
                   "tech": {"language": "Python", "framework": "PyTorch"}},
       tone="warning",
       dataSources=[{"kind": "grafana",
                     "url": "https://grafana.example.com/d/fraud/fraud-score-p99",
                     "label": "Fraud score p99"}]),
    el("risk-service", "service", "Risk Scoring", "mvp4",
       parent="intelligence-domain",
       properties={"description": "Portfolio and counterparty risk.",
                   "owner": "team-ml", "tags": ["ml"],
                   "tech": {"language": "Python"}}),
    el("reco-service", "service", "Personalization", "mvp4",
       parent="intelligence-domain",
       properties={"description": "Product recommendations.",
                   "owner": "team-ml", "tags": ["ml"],
                   "tech": {"language": "Python"}}),
    el("feature-store", "database", "Feature Store", "mvp4",
       parent="intelligence-domain", minLayer="engineering",
       properties={"description": "Online + offline ML features.",
                   "owner": "team-ml", "tags": ["redis", "ml"],
                   "tech": {"engine": "Redis + S3"}}),
    el("event-stream", "queue", "Event Stream", "mvp4",
       parent="intelligence-domain", minLayer="engineering",
       properties={"description": "Unified event bus for ML pipelines.",
                   "owner": "team-ml", "tech": {"broker": "Kafka"}}),
]

# ---------------------------------------------------------------------------
# Shared platform services
# ---------------------------------------------------------------------------
elements += [
    el("notification-service", "service", "Notifications", "mvp1",
       parent="platform-domain",
       properties={"description": "Email / SMS / push fan-out.",
                   "owner": "team-platform", "tech": {"language": "Go"}}),
    el("audit-service", "service", "Audit Log", "mvp1", parent="platform-domain",
       properties={"description": "Immutable audit trail for compliance.",
                   "owner": "team-platform", "tags": ["compliance"],
                   "tech": {"language": "Go"}}),
    el("config-service", "service", "Config & Flags", "mvp1",
       parent="platform-domain",
       properties={"description": "Feature flags and dynamic config.",
                   "owner": "team-platform", "tech": {"language": "Go"}}),
    el("notification-queue", "queue", "Notification Queue", "mvp1",
       parent="platform-domain", minLayer="engineering",
       properties={"description": "Async delivery queue.",
                   "owner": "team-platform", "tech": {"broker": "RabbitMQ"}}),
    el("audit-db", "database", "Audit Store", "mvp1", parent="platform-domain",
       minLayer="engineering",
       properties={"description": "Write-once audit records.",
                   "owner": "team-platform", "tech": {"engine": "ClickHouse"}}),
    el("observability", "service", "Observability", "mvp1",
       parent="platform-domain", minLayer="engineering",
       properties={"description": "Metrics, traces, logs (Grafana stack).",
                   "owner": "team-platform", "tags": ["ops"],
                   "tech": {"stack": "Grafana/Loki/Tempo"}},
       dataSources=[{"kind": "grafana", "url": "https://grafana.example.com/d/platform/uptime", "label": "Uptime"}]),
    el("email-provider", "external", "Email Provider", "mvp1",
       parent="platform-domain",
       properties={"description": "Transactional email (SendGrid).",
                   "tags": ["third-party"]}),
    # Removed example: a legacy service retired in mvp5
    el("legacy-batch", "service", "Legacy Batch (deprecated)", "mvp1",
       parent="platform-domain",
       properties={"description": "Old nightly batch — retired in Q5.",
                   "owner": "team-platform", "tags": ["legacy"]},
       tone="muted",
       lifecycle={"removedIn": "mvp5"}),
]

# ---------------------------------------------------------------------------
# Connections
# ---------------------------------------------------------------------------
# Frontends → gateway
for fe in ["web-app", "mobile-app", "merchant-portal", "ops-console"]:
    intro = "mvp2" if fe == "merchant-portal" else "mvp1"
    connections.append(
        conn(f"{fe}-to-gateway", fe, "api-gateway", "sync", intro,
             protocol="HTTPS", minLayer="architecture"))

# Gateway → core services
for svc in ["auth-service", "account-service", "payment-service",
            "lending-service", "fraud-service"]:
    intro = {"payment-service": "mvp2", "lending-service": "mvp3",
             "fraud-service": "mvp4"}.get(svc, "mvp1")
    connections.append(
        conn(f"gateway-to-{svc}", "api-gateway", svc, "sync", intro,
             protocol="gRPC"))

# Banking internal
connections += [
    conn("account-to-ledger", "account-service", "ledger-service", "sync", "mvp1",
         protocol="gRPC"),
    conn("account-to-db", "account-service", "customer-db", "data", "mvp1",
         protocol="SQL", minLayer="engineering"),
    conn("ledger-to-db", "ledger-service", "ledger-db", "data", "mvp1",
         protocol="SQL", minLayer="engineering"),
    conn("auth-to-db", "auth-service", "customer-db", "data", "mvp1",
         protocol="SQL", minLayer="engineering"),
]

# Payments
connections += [
    conn("payment-to-ledger", "payment-service", "ledger-service", "sync", "mvp2",
         protocol="gRPC"),
    conn("payment-to-settlement", "payment-service", "settlement-service",
         "async", "mvp2", protocol="Kafka"),
    conn("payment-to-queue", "payment-service", "payment-queue", "event", "mvp2",
         protocol="Kafka", minLayer="engineering"),
    conn("payment-to-db", "payment-service", "payment-db", "data", "mvp2",
         protocol="SQL", minLayer="engineering"),
    conn("settlement-to-cards", "settlement-service", "card-network", "sync",
         "mvp2", protocol="ISO8583"),
    conn("settlement-to-banks", "settlement-service", "bank-rails", "sync", "mvp2",
         protocol="ISO20022"),
    conn("merchant-to-payment", "merchant-portal", "payment-service", "sync",
         "mvp2", protocol="HTTPS", minLayer="architecture"),
]

# Lending
connections += [
    conn("lending-to-credit", "lending-service", "credit-engine", "sync", "mvp3",
         protocol="gRPC"),
    conn("credit-to-bureau", "credit-engine", "credit-bureau", "sync", "mvp3",
         protocol="HTTPS"),
    conn("lending-to-db", "lending-service", "lending-db", "data", "mvp3",
         protocol="SQL", minLayer="engineering"),
    conn("lending-to-ledger", "lending-service", "ledger-service", "sync", "mvp3",
         protocol="gRPC"),
    conn("credit-to-bureau-data", "credit-engine", "feature-store", "data", "mvp4",
         protocol="Redis", minLayer="engineering"),
]

# Intelligence — consumes the event stream
connections += [
    conn("payment-q-to-stream", "payment-queue", "event-stream", "event", "mvp4",
         protocol="Kafka", minLayer="engineering"),
    conn("stream-to-fraud", "event-stream", "fraud-service", "event", "mvp4",
         protocol="Kafka"),
    conn("stream-to-risk", "event-stream", "risk-service", "event", "mvp4",
         protocol="Kafka"),
    conn("fraud-to-features", "fraud-service", "feature-store", "data", "mvp4",
         protocol="Redis", minLayer="engineering"),
    conn("risk-to-features", "risk-service", "feature-store", "data", "mvp4",
         protocol="Redis", minLayer="engineering"),
    conn("reco-to-features", "reco-service", "feature-store", "data", "mvp4",
         protocol="Redis", minLayer="engineering"),
    conn("fraud-to-payment", "fraud-service", "payment-service", "sync", "mvp4",
         protocol="gRPC", minLayer="architecture"),
    conn("reco-to-account", "reco-service", "account-service", "sync", "mvp4",
         protocol="gRPC"),
    conn("risk-to-lending", "risk-service", "lending-service", "sync", "mvp4",
         protocol="gRPC"),
]

# Platform — everyone notifies + audits
connections += [
    conn("payment-to-notif", "payment-service", "notification-service", "async",
         "mvp2", protocol="AMQP"),
    conn("account-to-notif", "account-service", "notification-service", "async",
         "mvp1", protocol="AMQP"),
    conn("lending-to-notif", "lending-service", "notification-service", "async",
         "mvp3", protocol="AMQP"),
    conn("notif-to-queue", "notification-service", "notification-queue", "event",
         "mvp1", protocol="AMQP", minLayer="engineering"),
    conn("notif-to-email", "notification-service", "email-provider", "sync", "mvp1",
         protocol="HTTPS"),
    conn("notif-q-to-email", "notification-queue", "email-provider", "async",
         "mvp1", protocol="HTTPS", minLayer="engineering"),
    conn("audit-to-db", "audit-service", "audit-db", "data", "mvp1", protocol="SQL",
         minLayer="engineering"),
    conn("ledger-to-audit", "ledger-service", "audit-service", "event", "mvp1",
         protocol="Kafka"),
    conn("payment-to-audit", "payment-service", "audit-service", "event", "mvp2",
         protocol="Kafka"),
    conn("lending-to-audit", "lending-service", "audit-service", "event", "mvp3",
         protocol="Kafka"),
    conn("ops-to-obs", "ops-console", "observability", "sync", "mvp1",
         protocol="HTTPS", minLayer="architecture"),
]

# Actor connections (business layer)
connections += [
    conn("customer-uses-web", "customer", "web-app", "sync", "mvp1",
         protocol="HTTPS", minLayer="business"),
    conn("customer-uses-mobile", "customer", "mobile-app", "sync", "mvp1",
         protocol="HTTPS", minLayer="business"),
    conn("merchant-uses-portal", "merchant", "merchant-portal", "sync", "mvp2",
         protocol="HTTPS", minLayer="business"),
    conn("ops-uses-console", "ops-analyst", "ops-console", "sync", "mvp1",
         protocol="HTTPS", minLayer="business"),
    conn("risk-uses-console", "risk-officer", "ops-console", "sync", "mvp3",
         protocol="HTTPS", minLayer="business"),
]

# ---------------------------------------------------------------------------
# Tours
# ---------------------------------------------------------------------------
tours = [
    {
        "id": "exec-overview",
        "name": "Executive Overview",
        "description": "The platform at the business layer, domain by domain.",
        "steps": [
            {"id": "exec-1", "viewpoint": {"fit": "all", "layer": "business",
             "mvp": "mvp5"},
             "caption": "Aurora platform — five domains at full scale.",
             "duration": 5000},
            {"id": "exec-2", "viewpoint": {"focus": "banking-domain",
             "layer": "business", "mvp": "mvp1", "zoom": 1.4},
             "caption": "It started with Core Banking in Q1.",
             "highlight": ["banking-domain"], "duration": 4000},
            {"id": "exec-3", "viewpoint": {"focus": "payments-domain",
             "layer": "business", "mvp": "mvp2", "zoom": 1.4},
             "caption": "Payments arrived in Q2.",
             "highlight": ["payments-domain"], "duration": 4000},
            {"id": "exec-4", "viewpoint": {"focus": "intelligence-domain",
             "layer": "business", "mvp": "mvp4", "zoom": 1.4},
             "caption": "ML-driven intelligence in Q4 ties it together.",
             "highlight": ["intelligence-domain"], "duration": 4000},
        ],
    },
    {
        "id": "payment-flow",
        "name": "A Payment, End to End",
        "description": "Follow a single payment through the architecture.",
        "steps": [
            {"id": "pay-1", "viewpoint": {"focus": "web-app",
             "layer": "architecture", "mvp": "mvp4", "zoom": 1.6},
             "caption": "A customer initiates a payment in the web app.",
             "highlight": ["web-app", "customer"], "duration": 3500},
            {"id": "pay-2", "viewpoint": {"focus": "payment-service",
             "layer": "architecture", "mvp": "mvp4", "zoom": 1.5},
             "caption": "The payment service orchestrates the flow.",
             "highlight": ["payment-service", "api-gateway"], "duration": 3500},
            {"id": "pay-3", "viewpoint": {"focus": "fraud-service",
             "layer": "architecture", "mvp": "mvp4", "zoom": 1.5},
             "caption": "Fraud detection scores it in real time.",
             "highlight": ["fraud-service", "event-stream"], "duration": 3500},
            {"id": "pay-4", "viewpoint": {"focus": "settlement-service",
             "layer": "architecture", "mvp": "mvp4", "zoom": 1.5},
             "caption": "Settlement moves money via the card networks.",
             "highlight": ["settlement-service", "card-network", "bank-rails"],
             "duration": 4000},
        ],
    },
]

doc = {
    "$schemaVersion": "1.0.0",
    "project": {
        "id": "aurora-platform",
        "name": "Aurora Platform",
        "description": "A fintech platform spanning banking, payments, lending, "
                       "and ML intelligence — evolved across five quarters.",
        "theme": "default",
    },
    "mvps": MVPS,
    "layers": LAYERS,
    "elements": elements,
    "connections": connections,
    "tours": tours,
}


if __name__ == "__main__":
    # Emit YAML with stable key order and block style for readability.
    yaml.dump(doc, sys.stdout, sort_keys=False, default_flow_style=False,
              width=100, allow_unicode=True)
    print(f"\n# elements: {len(elements)}, connections: {len(connections)}, "
          f"tours: {len(tours)}", file=sys.stderr)
