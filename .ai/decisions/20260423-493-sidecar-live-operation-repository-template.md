# Decision: Sidecar Live-Operation Repository Template

> **Task**: 493 — Sidecar Live-Operation Repository Template  
> **Date**: 2026-04-23  
> **Status**: accepted  
> **Depends on**: 492 (Grammar/Template/Instantiation Ladder)

---

## 1. Problem Statement

`narada.sonar` is an operational repository that instantiates a pattern not yet formalized in Narada's canonical vocabulary. It is:

- Not the operated system itself (`sonar.cloud`)
- Not a generic ops repo (it has a specific adjacency relationship)
- Not a Site (it contains config, not runtime substrate state)
- Not a USC construction repo

The pattern — a repository adjacent to a system repo that owns live-operation config, posture, and runbooks while binding to the system repo's `.narada/` interface — needs a canonical name, boundary definition, and template specification.

---

## 2. Canonical Name

```text
narada.sidecar-live-operation-repository-template
```

**Short name**: sidecar ops repo  
**Instantiation example**: `narada.sonar`

A sidecar live-operation repository is an **ops repo** that:

1. Lives adjacent to a system repo (not inside it)
2. Binds to that system repo's `.narada/` interface for tool capabilities
3. Runs live, governed operations against external systems
4. Owns operation configuration and operator posture
5. Does not own system code, schema, secrets, or tool implementations

---

## 3. Position on the Grammar/Template/Instantiation Ladder

| Level | Entity | What it is |
|-------|--------|------------|
| **Grammar** | Narada proper (`narada` monorepo) | Defines the runtime, control plane, CLI, and the concept of "ops repo" |
| **Template** | `narada.sidecar-live-operation-repository-template` | The canonical pattern this decision defines — what a sidecar ops repo contains, what it does not contain, and what boundaries it preserves |
| **Instantiation** | `narada.sonar` | A concrete sidecar ops repo adjacent to `sonar.cloud`, running a live mailbox operation |

This decision **does not** define a generator or materializer. It defines the template so that future instantiations can be evaluated against it and so that `narada init-repo` can optionally scaffold it.

---

## 4. What the Template Contains

### 4.1 Required Files

| File | Purpose | Authority |
|------|---------|-----------|
| `package.json` | Declares `@narada2/*` dependencies, operational scripts (`sync`, `daemon`, `status`, `ops`) | Operator |
| `config/config.json` | Live operation configuration: scopes, sources, charters, policy, tool catalog bindings | Operator |
| `config/config.example.json` | Documented, redacted template showing shape without secrets | Operator |
| `.env.example` | Credential template: lists required env vars, no values | Operator |
| `.gitignore` | Excludes `.env`, `node_modules/`, `logs/`, local configs, evidence with PII | Operator |
| `README.md` | Path-specific first-run guide: setup, commands, layout | Operator |
| `RUNBOOK.md` | Operational procedures: health checks, troubleshooting, daily routine, escalation paths | Operator |

### 4.2 Required Directories

| Directory | Purpose | Privacy |
|-----------|---------|---------|
| `config/` | Operation configuration files | Public-safe (no secrets) |
| `mailboxes/<id>/` | Mailbox-owned operational material (scenarios, knowledge, notes) | Mixed; `notes/` may be private |
| `workflows/<id>/` | Timer/workflow-owned operational material | Mixed |
| `logs/` | Local runner output, daemon stdout/stderr | Private |
| `evidence/` | Trial evidence, decision records, operator annotations | Private (may contain PII) |
| `knowledge/` | Operation-specific knowledge sources | Mixed |
| `scripts/` | Local operational scripts (e.g., shell supervisor) | Public-safe |

### 4.3 Required Operational Scripts (in `package.json`)

| Script | Command | Purpose |
|--------|---------|---------|
| `run:once` | `narada-daemon -c ./config/config.json --once` | One bounded cycle |
| `daemon` | `narada-daemon -c ./config/config.json` | Long-running daemon |
| `sync` | `narada sync -c ./config/config.json` | Manual sync |
| `status` | `narada status -c ./config/config.json` | Operational status |
| `ops` | `narada ops -c ./config/config.json` | Operator dashboard |
| `check` | `narada doctor -c ./config/config.json` | Health check |

### 4.4 Required Config Shape

The `config/config.json` must declare:

- One or more `scopes` (operations)
- `sources` per scope (e.g., `graph`, `timer`, `webhook`)
- `charter` runtime configuration
- `policy` with `allowed_actions`, `allowed_tools`, `require_human_approval`
- `tool_catalogs` binding to neighboring system repos

Example binding pattern:

```json
{
  "tool_catalogs": [
    {
      "type": "local_path",
      "path": "/home/andrey/src/sonar.cloud/.narada/tool-catalog.json"
    }
  ]
}
```

---

## 5. What the Template Does NOT Contain

| Forbidden Content | Why | Where It Belongs |
|-------------------|-----|------------------|
| System repo source code | Sidecar is adjacent, not a monorepo | System repo (`sonar.cloud`) |
| System repo diagnostics/DB wrappers/Sentry wrappers | Tool implementation is system-owned | System repo under `.narada/tools/` |
| System repo secrets (`.env`, DB credentials, API keys) | Secrets live with the system they authenticate | System repo or secure storage |
| Direct copies of `.narada/tools/` | Breaks the tool locality boundary; copies go stale | System repo `.narada/tools/` |
| `node_modules/` committed | Build artifact; installed by `pnpm install` | `.gitignore` |
| Raw PII in committed files | Evidence and logs may contain PII; must be `.gitignore`d or redacted | `evidence/` (gitignored) or redacted |
| Runtime substrate state (Site config, lock files, DB files) | Site is a runtime locus; sidecar is config | Site root (e.g., `~/.local/share/narada/{site-id}/`) |

---

## 6. Boundary Relative to Neighboring System Repo

The sidecar ops repo preserves a **three-layer boundary** with its neighboring system repo:

```text
┌─────────────────────────────────────────────────────────────┐
│  System Repo (e.g., sonar.cloud)                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  .narada/                                           │    │
│  │  ├── README.md        (interface contract)          │    │
│  │  ├── tool-catalog.json (tool declarations)          │    │
│  │  └── tools/           (tool implementations)        │    │
│  └─────────────────────────────────────────────────────┘    │
│  Owns: code, schema, diagnostics, secrets, tool impl        │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ binds to
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Sidecar Ops Repo (e.g., narada.sonar)                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  config/config.json                                 │    │
│  │  ├── tool_catalogs[] → refs system .narada/         │    │
│  │  ├── policy.allowed_tools[] → grants permission     │    │
│  │  └── policy.require_human_approval → gates execute  │    │
│  └─────────────────────────────────────────────────────┘    │
│  Owns: operation config, posture, runbooks, evidence        │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ executes through
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Narada Runtime                                             │
│  Owns: mediation, audit, timeout, authority enforcement     │
└─────────────────────────────────────────────────────────────┘
```

### 6.1 Ownership Summary

| Concern | System Repo | Sidecar Ops Repo | Narada Runtime |
|---------|-------------|------------------|----------------|
| Tool implementation | ✅ Owns | ❌ Must not copy | ❌ Must not invent |
| Tool binding / permission | ❌ Must not grant | ✅ Owns `allowed_tools` | ✅ Validates authority class |
| Operation config | ❌ Must not assume | ✅ Owns `config.json` | ✅ Reads and enforces |
| Posture / policy | ❌ Must not dictate | ✅ Owns `policy` block | ✅ Enforces at handoff |
| Runbooks / procedures | ❌ Must not embed | ✅ Owns `RUNBOOK.md` | ❌ Does not read |
| Evidence / audit | ❌ Must not collect | ✅ Owns `evidence/` | ✅ Produces durable records |
| Mediation / timeout | ❌ Must not perform | ❌ Must not perform | ✅ Owns execution |
| Secrets | ✅ Owns system secrets | ✅ Owns Graph/charter secrets | ❌ Must not persist |

### 6.2 Tool Locality Doctrine Applied

The sidecar ops repo is the canonical location for the **middle layer** of the Tool Locality Doctrine:

```text
System repo owns tool implementation.
Sidecar ops repo owns tool binding and permission.
Narada runtime owns mediation, audit, timeout, and authority enforcement.
```

This means:

1. The sidecar ops repo's `config.json` references the system repo's `tool-catalog.json` — it does not inline tool definitions.
2. The sidecar ops repo's `policy.allowed_tools` grants permission to specific tool IDs — the catalog declaration alone is not permission.
3. The sidecar ops repo's `policy.require_human_approval` and `allowed_actions` govern what effects may proceed — the system repo cannot bypass this.
4. Narada runtime enforces authority classes, timeouts, and audit trails — neither repo can override this.

---

## 7. Core Components

### 7.1 Operation Config

The `config/config.json` is the single source of truth for what the sidecar does. It declares:

- **Scopes**: what operations exist (e.g., `help-global-maxima`)
- **Sources**: where facts come from (e.g., Graph API mailbox)
- **Charters**: which judgment roles evaluate work
- **Policy**: what actions are allowed, what tools are permitted, whether human approval is required
- **Tool catalogs**: where to find tool declarations from neighboring systems

### 7.2 Posture / Policy

The `policy` block in `config.json` expresses operator intent about risk tolerance:

- `allowed_actions`: the closed set of effects the foreman may emit (e.g., `draft_reply` but not `send_reply`)
- `allowed_tools`: the closed set of tools charters may request
- `require_human_approval`: whether the foreman may create intents without operator review
- `primary_charter` / `secondary_charters`: which judgment roles are active

This is operator-owned, not system-owned and not hardcoded in the runtime.

### 7.3 Operator Runbooks

`RUNBOOK.md` is the canonical operator procedures document. It contains:

- Quick reference command table
- Step-by-step procedures (one-shot check, daemon start/stop, health check)
- Draft inspection and approval workflow
- Troubleshooting guide with symptoms, causes, and actions
- Daily operator routine
- Boundaries and escalation rules

Runbooks are operator-facing, not machine-readable. They complement the runtime's `Observation` API by providing human judgment guidance.

### 7.4 Evidence

The `evidence/` directory contains durable records of operational trials, decisions, and findings:

- Trial evidence records (preflight, inbound trigger, evaluation, outbound, disposition, reconciliation)
- Decision artifacts (closure decisions, policy changes)
- Operator annotations

Evidence is private by default. Redacted summaries may be copied to public gap tasks.

### 7.5 Mailbox/Workflow-Owned Operational Materials

Per-scope directories (`mailboxes/<id>/`, `workflows/<id>/`) contain:

- `scenarios/`: canonical operational scenarios and fixtures
- `knowledge/`: private knowledge sources for charters
- `notes/`: operator notes and context
- `README.md`: scope metadata (charter, posture, folders)

These are operation-owned, not system-owned.

### 7.6 Tool-Catalog Bindings to Neighboring Repos

The sidecar ops repo binds to system-owned tool catalogs through the `tool_catalogs` array in `config.json`. Each entry is a reference, not a copy:

```json
{
  "type": "local_path",
  "path": "../sonar.cloud/.narada/tool-catalog.json"
}
```

The sidecar ops repo then grants selected tools through `policy.allowed_tools`:

```json
{
  "allowed_tools": [
    "sonar.git.read",
    "sonar.db.query_readonly",
    "sonar.sentry.search"
  ]
}
```

This is the binding layer: the sidecar decides which capabilities from the system repo are available to its charters.

---

## 8. Public/Private Split

### 8.1 Private (never committed, `.gitignore`d)

| Path | Content | Reason |
|------|---------|--------|
| `.env` | Live secrets (Graph token, charter API key) | Credential hygiene |
| `logs/` | Runtime stdout/stderr, daemon output | May contain PII, stack traces, tokens |
| `evidence/` | Trial records, decision artifacts | May contain PII, message bodies, Graph IDs |
| `node_modules/` | Installed dependencies | Build artifact |
| `*.local.json` | Local config overrides | Environment-specific |

### 8.2 Public-Safe (committed)

| Path | Content | Reason |
|------|---------|--------|
| `README.md` | Setup, commands, layout | No secrets; first-run guide |
| `RUNBOOK.md` | Procedures, troubleshooting | Redact PII before commit if any |
| `config/config.example.json` | Documented config template | No secrets; educational |
| `.env.example` | Credential template (names only) | No values |
| `package.json` | Dependencies, scripts | No secrets |
| `scripts/` | Supervisor, helpers | No secrets |
| `mailboxes/<id>/README.md` | Scope metadata | No secrets |
| `mailboxes/<id>/scenarios/` | Canonical fixtures | Public-safe test data |

### 8.3 Mixed (operator judgment)

| Path | Content | Guidance |
|------|---------|----------|
| `mailboxes/<id>/knowledge/` | Charter knowledge sources | Review for PII before commit |
| `mailboxes/<id>/notes/` | Operator notes | Keep private if containing customer data |
| `knowledge/` | Operation-wide knowledge | Review for PII |

---

## 9. Concrete Mapping: `narada.sonar`

| Template Component | `narada.sonar` Concrete Location | Notes |
|--------------------|----------------------------------|-------|
| **Sidecar root** | `~/src/narada.sonar` | Adjacent to `~/src/sonar.cloud` |
| **System repo** | `~/src/sonar.cloud` | The operated system |
| **System `.narada/`** | `~/src/sonar.cloud/.narada/` | Tool catalog and wrappers |
| **Config** | `config/config.json` | One scope: `help-global-maxima` |
| **Config example** | `config/config.example.json` | Documented template |
| **Package manifest** | `package.json` | `@narada2/*` file dependencies |
| **Secrets** | `.env` (gitignored) | Graph token, charter runtime config |
| **Runbook** | `RUNBOOK.md` | 10-section live operation runbook |
| **Evidence** | `evidence/297-302-mailbox-operational-trial/` | Trial evidence from Tasks 297–302 |
| **Mailbox scope** | `mailboxes/help@global-maxima.com/` | One live mailbox operation |
| **Scenarios** | `mailboxes/help@global-maxima.com/scenarios/issa-followup.yaml` | Canonical support scenario |
| **Knowledge** | `mailboxes/help@global-maxima.com/knowledge/` (future), `knowledge/` | Charter knowledge sources |
| **Supervisor** | `scripts/supervisor.sh` | WSL shell supervisor (systemd unavailable) |
| **Logs** | `logs/daemon.log`, `logs/daemon.pid` | Runtime output (gitignored) |
| **Tool binding** | `config.json → tool_catalogs[0].path = "../sonar.cloud/.narada/tool-catalog.json"` | Relative path binding |
| **Allowed tools** | `sonar.git.read`, `sonar.db.query_readonly`, `sonar.sentry.search`, `sonar.git.write` | Grants permission to 4 Sonar tools |
| **Posture** | `draft-only`, `require_human_approval: true` | Conservative; no autonomous send |
| **Primary charter** | `support_steward` | Support judgment role |
| **Secondary charter** | `obligation_keeper` | Obligation tracking role |

### 9.1 Boundary Verification

`narada.sonar` correctly preserves the sidecar boundary:

- ✅ **Does not contain** Sonar source code, DB wrappers, Sentry wrappers
- ✅ **Does not contain** Sonar `.env` or secrets
- ✅ **References** (does not copy) `sonar.cloud/.narada/tool-catalog.json`
- ✅ **Owns** operation config, posture, runbooks, evidence
- ✅ **Grants** selected tools through `allowed_tools`
- ✅ **Requires** human approval for all effects
- ✅ **Keeps** evidence and logs private (`.gitignore`)

### 9.2 Gaps Relative to Template

| Gap | Severity | Remediation |
|-----|----------|-------------|
| No `workflows/` directory yet | Minor | Expected when first workflow is added |
| `mailboxes/<id>/knowledge/` is empty | Minor | Expected; knowledge is populated over time |
| `knowledge/` is empty | Minor | Expected; operation-wide knowledge added as needed |
| Supervisor is WSL-specific shell script | Acceptable | Substrate-specific; systemd unavailable in WSL |

---

## 10. Relationship to Other Concepts

| Concept | Relationship to Sidecar Ops Repo |
|---------|----------------------------------|
| **Ops repo** (from `narada init-repo`) | A sidecar ops repo is a *specialized* ops repo with a specific adjacency relationship to a system repo. All sidecar ops repos are ops repos; not all ops repos are sidecar ops repos. |
| **Site** (from `narada sites init`) | A Site is a runtime locus. A sidecar ops repo *configures* operations that run on a Site. The Site holds substrate state; the sidecar holds operation config. |
| ** USC construction repo** (from `narada init usc`) | A USC repo builds charters and domain packs. A sidecar ops repo *uses* charters and domain packs to run live operations. Separate concerns, may compose. |
| **Template** (this decision) | The canonical pattern. `narada.sonar` is an instantiation. Future sidecar ops repos should be evaluated against this template. |

---

## 11. Future Work (Out of Scope)

This decision **does not** create:

1. A generator (`narada init-repo --sidecar <system-repo>`) — deferred to a future task
2. A validator (`narada doctor --sidecar`) — deferred
3. A materializer that scaffolds the directory structure — deferred
4. A rename of `narada.sonar` — explicitly out of scope

When a generator is built, it should scaffold:

```text
<repo-name>/
  package.json
  config/
    config.json           (empty scopes, tool_catalogs pointing to system .narada/)
    config.example.json
  .env.example
  .gitignore
  README.md
  RUNBOOK.md
  scripts/
  mailboxes/
  workflows/
  logs/                   (gitignored)
  evidence/               (gitignored)
  knowledge/
```

---

## 12. Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| The sidecar live-operation repository template is defined | ✅ | §2–§7 of this decision |
| Its boundary relative to a neighboring operated repo is explicit | ✅ | §6, §6.1, §6.2, and diagram |
| Its required contents are listed | ✅ | §4.1, §4.2, §4.3, §4.4 |
| `narada.sonar` is mapped onto the template concretely | ✅ | §9 table and §9.1 verification |
| A durable decision/spec artifact is created | ✅ | This file |
| Verification evidence is recorded in this task | ✅ | §9.1 boundary verification, §9.2 gap table |
