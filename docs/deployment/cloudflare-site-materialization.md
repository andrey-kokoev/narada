# Cloudflare Site Materialization Design

> Design for the first concrete `Site` materialization: a Cloudflare-backed Narada runtime.
>
> This document uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.

---

## 1. Introduction

Cloudflare is the first concrete **Site materialization** for Narada. It is not the generic deployment layer itself, nor is it a replacement for local development Sites. It is one substrate that satisfies the Site contract.

Narada should learn the real deployment boundary from one honest Cloudflare-backed Site before extracting a provider-neutral substrate model.

---

## 2. Definitions

### `Site`

The **semantic anchor** for an Aim-at-Site binding.

A Site is where an Aim becomes runnable. It holds:
- state (facts, work items, decisions, confirmations)
- substrate bindings (Graph API, charter runtime, secrets)
- runtime context (policy, posture, allowed actions)

A local filesystem root with `better-sqlite3` is one Site. A Cloudflare-backed runtime is another.

### `Site substrate`

The **capability class** that a Site requires from its host environment.

For the Cloudflare prototype, the substrate class is:

```text
cloudflare-workers-do-sandbox
```

This class requires:
- event-driven compute (Worker)
- scheduled invocation (Cron Trigger)
- durable coordination with strong consistency (Durable Object)
- bounded execution environment (Sandbox / Container)
- object storage for large artifacts (R2)
- secret binding (Worker Secrets)
- optional: queue-based deferred work (Queues / Workflows)

### `Site materialization`

The **concrete Cloudflare project and resources** that instantiate a Site.

A materialization is the sum of:
- one or more Workers (control surface, Cycle entrypoint)
- one Durable Object namespace (per-Site coordination state)
- one or more Cron Triggers (Cycle scheduling)
- one R2 bucket (evidence, snapshots, large artifacts)
- Worker Secrets (credentials for Graph, Kimi, etc.)
- Routes / Access policies (operator surface exposure)

### `Cycle runner`

The **Worker / Cron / Sandbox machinery** that advances an Aim at the Site.

The Cycle runner is not a long-running daemon. It is an event-driven function that:
1. receives a scheduled or on-demand invocation
2. acquires the Site coordination lock
3. executes one bounded Cycle
4. releases the lock and exits

### `Trace storage`

Where **decisions, logs, run evidence, and health** are written.

On Cloudflare:
- Durable Object SQLite holds compact control-state Traces (decisions, evaluations, transitions)
- R2 holds large Trace artifacts (raw sync snapshots, evaluation dumps, backup manifests)
- Worker Logs / Tail Workers hold ephemeral execution Traces

---

## 3. Cloudflare Resource Mapping

| Cloudflare Resource | Narada Reading |
| --- | --- |
| **Worker** | Control / API surface and Cycle entrypoint. Receives Cron events, HTTP operator requests, and webhook callbacks. Stateless between invocations. |
| **Cron Trigger** | Cycle scheduler. Fires the Worker at a configured interval to begin a new Cycle. |
| **Durable Object** | Per-Site coordination, lock, and compact SQLite/control state. One DO instance per Site. Strong consistency for lease-like operations. |
| **Durable Object SQLite** | Coordinator/control-state candidate. Stores `context_records`, `work_items`, `foreman_decisions`, and other compact durable state. |
| **Sandbox / Container** | Bounded Cycle execution environment. Runs charter evaluation, tool calls, and effect workers inside resource limits. |
| **R2** | Large artifact, evidence, raw snapshot, and backup storage. Holds message payloads, evaluation dumps, sync snapshots, and rebuild inputs. |
| **Worker Secrets** | Credential binding for Graph API, Kimi API, and other external services. Bound at the Worker level, scoped per Site via naming convention. |
| **Routes / Access Policy** | Operator surface exposure boundary. Controls which endpoints are reachable and who may invoke them. |
| **Queues / Workflows** | Deferred optional orchestration primitives. Can buffer outbound Acts for retry or chain multi-stage Cycles without blocking the entrypoint Worker. |

---

## 4. Bounded Cloudflare Cycle

A Cloudflare Cycle is a **bounded attempt** to advance an Aim at a Site. It must complete within the execution limits of the Cloudflare substrate (Worker CPU time, Sandbox wall-clock time).

The Cycle explicitly avoids long-running daemon assumptions.

### Steps

1. **Acquire Site/Cycle lock** — Claim exclusive coordination authority in the Durable Object. Fail fast if another Cycle is active.
2. **Sync source deltas** — Pull new facts from the Source (e.g., Graph API delta sync). Write cursor and apply-log updates.
3. **Derive / admit work** — Run context formation + foreman admission over new facts. Open or supersede work items.
4. **Run charter evaluation** — Lease runnable work, execute charters in the Sandbox, persist evaluations.
5. **Create draft / intent handoffs as allowed** — Run foreman governance over evaluations. Create outbound commands or intents where policy permits.
6. **Reconcile submitted effects** — Check confirmation status of previously submitted Acts. Update durable state.
7. **Update health and Trace** — Write health record, transition log, and run summary to Trace storage.
8. **Release lock and exit** — Clean up ephemeral state, release the DO coordination lock, return HTTP 200 or schedule next Cron.

### Boundedness Guarantees

- A Cycle has a **hard wall-clock ceiling** configured to the runtime-enforced limit of the substrate (Worker CPU time, Sandbox wall-clock time).
- If the ceiling is reached, the Cycle **gracefully aborts** at the next safe boundary, releases the lock, and leaves a partial-Trace.
- The next Cron invocation picks up where the partial-Trace left off (cursor-driven, idempotent).
- No Cycle may assume it is the only running process. Lock acquisition is mandatory.

---

## 5. Local Assumptions That Break

| Local Assumption | Cloudflare Replacement | Status |
|------------------|------------------------|--------|
| Local filesystem mailbox root (`./data/.../messages/`) | R2 for large artifacts; DO SQLite for metadata | **Designed** |
| PID-file daemon health (`./.health.json`, process liveness) | Durable Object health record + Cron heartbeat observability | **Designed** |
| Local `better-sqlite3` coordinator file (`./.narada/coordinator.db`) | Durable Object SQLite or D1 for coordinator state | **Candidate** — DO SQLite preferred for strong consistency; D1 evaluated for read-heavy observation |
| Long-running process lifecycle (daemon stays up for hours) | Event-driven Worker + Cron; no persistent process | **Designed** |
| `.env` file loading at startup | Worker Secrets bound at deploy time; per-Site secret scoping via naming | **Designed** |
| Local logs as primary Trace (filesystem `logs/` directory) | Worker Logs + Tail Workers for ephemeral; R2 for durable evidence | **Designed** |
| Direct package/file dependency layout (`node_modules` on same host) | Worker bundle + Sandbox image; dependencies resolved at build time | **Designed** |
| One-shot CLI used as deployment primitive (`narada sync --once`) | HTTP-triggered Worker endpoint or Cron Trigger; CLI becomes operator tool, not runtime primitive | **Designed** |
| Synchronous subprocess tool calls (`child_process.spawn`) | Sandbox / Container execution with explicit resource limits; async result callback | **Deferred** — v0 may inline simple tools; complex tools need Sandbox design |
| Local SQLite `ATTACH` for multi-database queries | DO SQLite single-database only; cross-store joins require application-level composition | **Unresolved** — observation queries may need redesign |
| File-based view store (`views/by-thread/`, symlinks) | R2 object listing or DO SQLite indexed views | **Deferred** — v0 uses DO SQLite; file views rebuilt on demand |

---

## 6. v0 Prototype Boundary

### In v0

```text
One Cloudflare Worker
+ one Durable Object
+ one R2 bucket
+ one Cron Trigger
+ one minimal Sandbox/Container proof
```

can execute **one bounded mailbox Cycle** for **one configured Aim-at-Site binding**, write health/Trace, and expose a **private operator status endpoint**.

Specifically, v0 requires:
- Worker receives Cron Trigger → begins Cycle
- Durable Object holds coordination lock + compact SQLite state
- R2 holds message payloads, sync snapshots, evaluation evidence
- Worker Secrets hold Graph API and charter runtime credentials
- Cycle completes: sync → admit → evaluate → govern → handoff → reconcile → trace
- A minimal Sandbox/Container can execute a bounded no-op or cycle-smoke payload (proof that the execution environment works; full charter/tool catalog is deferred)
- Private `/status` endpoint returns health and last-Cycle summary

### Deferred

- **Full charter runtime in Sandbox** — v0 proves the Sandbox can run *something* bounded; running the full charter runtime with tool catalog inside the Sandbox is v1
- **Multi-Site** — one Worker set per Site for v0; shared Worker pool across Sites is v1
- **Queues / Workflows** — outbound retry and deferred orchestration are v1
- **D1 observation store** — read-heavy observation queries may move to D1; v0 uses DO SQLite
- **Operator action mutations** — approve/reject drafts via endpoint; v0 is observation-only
- **Multi-vertical** — mailbox only for v0; timer/webhook peers are v1
- **Real-time sync** — delta webhook push instead of Cron polling; v1

---

## 7. Secret Binding and Egress Policy

### 7.1 Secret Naming Convention

Worker Secrets are global to a Worker script. Per-Site scoping is achieved via naming:

```text
NARADA_{site_id}_{secret_name}
```

Where `site_id` is normalized: uppercase, hyphen-safe.

Examples:

```text
NARADA_HELP_GRAPH_ACCESS_TOKEN
NARADA_HELP_GRAPH_TENANT_ID
NARADA_HELP_GRAPH_CLIENT_ID
NARADA_HELP_GRAPH_CLIENT_SECRET
NARADA_HELP_KIMI_API_KEY
NARADA_HELP_ADMIN_TOKEN
```

### 7.2 Required Secret Schema

A Cloudflare Site requires at minimum:

| Secret Name | Purpose | Required? | Vertical |
|-------------|---------|-----------|----------|
| `GRAPH_ACCESS_TOKEN` | Microsoft Graph API access | Yes | mailbox |
| `GRAPH_TENANT_ID` | Microsoft Graph tenant | Yes | mailbox |
| `GRAPH_CLIENT_ID` | Microsoft Graph app client | Yes | mailbox |
| `GRAPH_CLIENT_SECRET` | Microsoft Graph app secret | Yes | mailbox |
| `KIMI_API_KEY` | Charter runtime API key | Yes | all |
| `ADMIN_TOKEN` | Operator status endpoint auth | Yes | all |

### 7.3 Egress Policy

The Worker must declare which external hosts it may call:

| Host | Purpose |
|------|---------|
| `graph.microsoft.com` | Graph API sync and draft creation |
| `api.openai.com` | Charter runtime API (OpenAI) |
| `api.moonshot.cn` | Charter runtime API (Moonshot) |

All other egress is denied by default.

### 7.4 Rotation Strategy

- Secrets are rotated manually by the operator via the Cloudflare dashboard or API.
- The Worker reads secrets at invocation time; no caching beyond one Cycle.
- On secret mismatch (e.g., 401 from Graph API), the Cycle fails gracefully and records the auth failure in health/Trace.
- Automatic secret rotation is deferred to v1.

---

## 8. Post-Prototype Corrective Notes

These notes reflect the actual v0 implementation (Tasks 320–329) and update design assumptions documented above.

### DO Schema

The Durable Object SQLite schema as shipped includes these tables:

- `site_locks` — lock state with TTL expiry
- `site_health` — `status`, `last_cycle_at`, `last_cycle_duration_ms`, `consecutive_failures`, `pending_work_items`, `locked`, `locked_by_cycle_id`, `message`, `updated_at`
- `cycle_traces` — `cycle_id`, `started_at`, `finished_at`, `status`, `steps_completed`, `error`, `trace_key`
- `context_records` — synthetic fact/context storage
- `work_items` — synthetic work-item storage
- `evaluations` — charter evaluation records
- `decisions` — foreman decision records
- `outbound_commands` — outbound command state machine

The `site_health` table was expanded beyond the original design with `pending_work_items`, `locked`, and `locked_by_cycle_id`.

### Cycle Runner v0 Reality

The shipped Cycle runner (`runCycle` in `src/runner.ts`) mechanically executes all 8 steps. Steps 2–6 were originally placeholder no-ops, but Tasks 345–348 replaced them with fixture-backed kernel-spine handlers:

- **Step 2 (sync)**: `createSyncStepHandler` — fixture delta admission into durable facts with cursor/apply-log
- **Step 3 (derive_work)**: `createDeriveWorkStepHandler` — context formation and work-item opening from unadmitted facts
- **Step 4 (evaluate)**: `createEvaluateStepHandler` — fixture evaluator producing synthetic evaluation evidence
- **Step 5 (handoff)**: `createHandoffStepHandler` — decision and outbound command creation
- **Step 6 (reconcile)**: `createReconcileStepHandler` — confirmation via externally-provided fixture observations

These handlers operate over real DO SQLite tables (`facts`, `context_records`, `work_items`, `evaluations`, `decisions`, `outbound_commands`, `fixture_observations`) and preserve IAS boundaries: facts ≠ context/work, evaluation ≠ decision, decision ≠ intent/handoff, confirmation requires separate observation.

The handlers are **fixture-backed**, not live-production. Real source sync (Microsoft Graph), live charter runtime (OpenAI/Kimi), and live effect execution (email send) remain deferred to v1.

### DO Communication

In v0 tests, the Worker calls DO methods directly on the resolved stub. In production, the Worker → DO boundary must use `fetch()` RPC via the DO's `fetch()` handler. The DO's `fetch()` handler exists but is currently a stub.

### Sandbox v0 Boundary

The v0 Sandbox proof (`src/sandbox/runner.ts`) demonstrates timeout/memory guards and executes a bounded no-op smoke payload. Running the full charter runtime with tool catalog inside the Sandbox is deferred to v1.

### Secret Binding

Secret naming convention (`NARADA_{site_id}_{secret_name}`) is documented but not yet validated at Worker startup. No automatic rotation is implemented.

### Operator Surface

The v0 operator surface is read-only (`GET /status`). Operator mutations (approve draft, retry work item) are deferred to v1.

### DO SQLite Authority

The design doc above frames DO SQLite as holding "compact control-state Traces" and "compact shadows of the full coordinator schema." In the shipped prototype, the DO stores full facsimiles of `context_records`, `work_items`, `evaluations`, `decisions`, and `outbound_commands`. These are **authoritative durable records**, not merely traces or shadows. The DO SQLite is the Site's authoritative state store.

SEMANTICS.md §2.14.1 legitimizes this: "A traced record may also be an authoritative structure (e.g., a `foreman_decision` is both a control-authority record and a Trace of how that authority was exercised). Trace does not strip authority from the records it explains."

The DO **stores** these records but does not **produce** them. Foreman governance, scheduler leasing, and outbound handoff remain Narada runtime concerns that run inside the Cycle and write to the DO.

### `scope_id` / `site_id` Conflation

The Cycle entrypoint (`src/cycle-entrypoint.ts`) passes `req.scope_id` to `runCycle(siteId)`. This conflates two concepts:
- `scope_id`: internal Narada partition for an Aim-at-Site binding
- `site_id`: Cloudflare Site identifier (DO instance name)

For v0 single-Site, single-scope setups, the values coincide. Multi-scope or multi-Site support in v1 requires an explicit `scope_id → site_id` resolution layer.

---

## 9. Cross-References

| Document | Relationship |
|----------|--------------|
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Canonical definitions of Aim, Site, Cycle, Act, Trace |
| [`docs/concepts/runtime-usc-boundary.md`](../concepts/runtime-usc-boundary.md) | Runtime / USC / operator ownership boundary; explains how Site materialization avoids recursion confusion |
| [`AGENTS.md`](../../AGENTS.md) | Agent navigation hub; links to this document |
| [`.ai/decisions/20260421-329-cloudflare-prototype-closure.md`](../../.ai/decisions/20260421-329-cloudflare-prototype-closure.md) | Closure review for Tasks 320–329 — task-by-task assessment, gap table, v1 scope decisions |
| [`.ai/decisions/20260421-330-cloudflare-site-ontology-closure.md`](../../.ai/decisions/20260421-330-cloudflare-site-ontology-closure.md) | Ontology closure review for Tasks 320–329 — semantic drift check, artifact classification, generic Site abstraction decision |
| [`docs/deployment/cloudflare-live-adapter-boundary-contract.md`](cloudflare-live-adapter-boundary-contract.md) | Live-adapter boundary contract for Tasks 351–357 — adapter taxonomy, in-scope/out-of-scope seams, authority boundaries |
| [`docs/deployment/cloudflare-effect-execution-authority-contract.md`](cloudflare-effect-execution-authority-contract.md) | Effect-execution authority contract for Tasks 358–364 — state transitions, approved-command eligibility, confirmation separation |
