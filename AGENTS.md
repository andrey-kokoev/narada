# AGENTS.md — narada-root

> **Navigation Hub**: This file provides orientation. For the canonical kernel lawbook, see [`packages/layers/control-plane/docs/00-kernel.md`](packages/layers/control-plane/docs/00-kernel.md). For detailed documentation, see the numbered guides in [`packages/layers/control-plane/docs/`](packages/layers/control-plane/docs/).
>
> **Agent execution contract**: Task execution is governed by [`.ai/task-contracts/agent-task-execution.md`](.ai/task-contracts/agent-task-execution.md), including the coherence-control rules: tasks are pressure intent, fixtures prove usefulness through invariants, and posture changes require evidence.

---

## Project Overview

Narada is a composed topology of authority-homogeneous zones connected by governed crossings.

- A **zone** is a region in which one authority grammar remains invariant.
- A **governed crossing** is the durable, admissible transfer from one zone to another.
- A crossing is not separate from its regime: each crossing edge carries its own admissibility regime, crossing artifact, and confirmation law.
- Narada preserves correctness by preventing illicit shortcuts across zones and by requiring every meaningful crossing to produce a durable artifact under an explicit regime.

Viewed operationally, Narada is a generalized, deterministic kernel for turning remote source deltas into locally materialized state and durable side-effect intents. It tolerates crashes at any point, handles re-fetching overlapping data, and converges to correct state without coordination with the source.

**Primary Shape**: Narada is not best understood as a bag of modules or only as a pipeline. Its primary explanatory shape is:

- a composed topology of authority-homogeneous zones,
- connected by governed crossings.

From that primary shape, the familiar Narada readings follow:

- **state compiler**: what the topology does;
- **nine-layer pipeline**: one canonical traversal through the topology;
- **Aim / Site / Cycle / Act / Trace**: operator/runtime view of the same topology;
- **Intelligence-Authority Separation**: one core invariant of the topology;
- **crossing regime**: the local law governing each crossing.

**Core Identity**: This is NOT a sync client, cache, or mirror. It is a deterministic state compiler from remote deltas into local canonical state, with a durable control plane for action governance. That compiler reading is derived from the deeper zone-and-crossing structure above.

**Mailbox as One Vertical**: The Microsoft Graph/Exchange mailbox integration is the first vertical built on the kernel. It uses:
- `ExchangeSource` as one `Source` implementation
- `mail.*` fact types as one fact family
- Mailbox policy/charters as one policy family
- `mail.*` intents as one intent/executor family

**Peer Verticals**: `TimerSource`, `WebhookSource`, `process.run`, and future automations are first-class peers that travel through the same kernel pipeline (Source → Fact → Policy → Intent → Execution → Observation).

**Fact Boundary**: Facts are the first canonical durable boundary. All replay determinism derives from fact identity. No kernel section may assume mailbox, conversation, or message semantics.

**Intent Boundary**: `Intent` is the universal durable effect boundary. All side effects (mail sends, process spawns, future automations) must be represented as an Intent before execution. Idempotency is enforced at `idempotency_key`.

**Control Plane v2**: Above the compiler, a control plane manages first-class generalized work objects (`work_item`, `execution_attempt`, `outbound_command`). Work is derived from `PolicyContext` via `ContextFormationStrategy`, making mailbox one vertical among many (timer, process, etc.). For the integrated end-to-end model, see [`.ai/do-not-open/tasks/20260414-011-chief-integration-control-plane-v2.md`](.ai/do-not-open/tasks/20260414-011-chief-integration-control-plane-v2.md).

> **Note on physical packaging**: The control plane's logical layers (foreman, scheduler, outbound worker, charter runtime) currently all live inside `packages/layers/control-plane/`. They are decomposed by directory and interface, not by separate packages. Extraction will happen only when a layer meets the stability and deployability criteria documented in [`packages/layers/control-plane/docs/02-architecture.md`](packages/layers/control-plane/docs/02-architecture.md).

**Terminology**: See [`TERMINOLOGY.md`](TERMINOLOGY.md) for the user-facing vocabulary guide, and [`SEMANTICS.md`](SEMANTICS.md) for the complete system ontology (identity lattice, core abstractions, invariant derivations). In short: users set up and run **operations**; Narada compiles each **operation** into exactly one internal **scope**.

### Semantic Crystallization Guidance

When describing higher-order architecture, deployment, or design:
- Use the topology reading as the primary semantic lens: Narada is a composed topology of authority-homogeneous zones connected by governed crossings.
- Prefer the compact tuple **`Aim / Site / Cycle / Act / Trace`** (see [`SEMANTICS.md §2.14`](SEMANTICS.md)) over overloaded generic terms like `operation`.
- When precision matters — specifications, interfaces, authority boundaries, agent instructions — use the **canonical expansion**: `Operation Specification` / `Runtime Locus` / `Control Cycle` / phase vocabulary / `Evidence Trace` (see [`SEMANTICS.md §2.14.6`](SEMANTICS.md)).
- Preserve Narada's **portable invariant spine** (see [`SEMANTICS.md §2.14.5`](SEMANTICS.md)): Sites, verticals, and principals may change, but durable boundaries and authority transitions must remain recognizable.
- Treat the nine-layer pipeline as a canonical traversal through the zone topology, not as the deeper primitive.
- Use the **Control Cycle phase vocabulary** (see [`SEMANTICS.md §2.14.7`](SEMANTICS.md)) when describing Cycle internals: Source Read → Fact Admission → Context Formation → Evaluation → Governance → Intent/Handoff → Execution Attempt → Confirmation/Reconciliation → Evidence Trace.
- Use the **Operation Specification** (not "telos") as the canonical reading of `Aim`. An Aim is inspectable, versionable, and independent of runtime.
- **`operation`** remains current user-facing CLI language. Do not invent new meanings for it.
- Do not call a user's configured work setup a **Narada instance**. Use **operation** for the configured unit of work, **operation specification** for its written/configured definition, and **runtime / daemon / Site** for deployed machinery.
- Do not rename CLI flags, database columns, or package APIs as part of this vocabulary shift.

## User Constraint Handling

- Do not interpret, narrow, relax, or silently carve exceptions into operator-set constraints.
- Treat an operator prohibition as still active until the operator explicitly lifts or changes it.
- If an operator constraint appears ambiguous, ask instead of inferring a narrower allowable path.

## Operator Input Format

- When asking for operator input, number the question and letter the options.
- Mark the recommended option with `(*)`.
- If more than one question is needed, ask them one at a time in order of decreasing entropy gain.
- Do not add editorial comments around the questions.

---

## Documentation Index

| Doc | Topic | Read If You... |
|-----|-------|----------------|
| [SEMANTICS.md](SEMANTICS.md) | **Canonical ontology** — single source of truth for all terms | Need a definition, identity format, or invariant |
| [SEMANTICS.md §2.13](SEMANTICS.md) | Intelligence-Authority Separation — canonical internal formulation | Need to understand why evaluation ≠ decision and why the control plane owns authority |
| [SEMANTICS.md §2.14.5](SEMANTICS.md) | Portable invariant spine — how Narada travels across Sites, verticals, and principals | Need to prevent substrate/vertical/agent collapse |
| [SEMANTICS.md §2.15](SEMANTICS.md) | Crossing regime — unifying abstraction of zone, boundary, crossing regime, and crossing artifact | Need to reason about boundary crossings generically |
| [SEMANTICS.md §2.17](SEMANTICS.md) | Zone template taxonomy — reusable zone templates, instance/template/stage distinction | Need to understand which zones share structural roles and invariant authority grammar |
| [SEMANTICS.md §2.8](SEMANTICS.md) | Re-derivation / recovery operator family | Need to understand replay, preview, recovery, rebuild, or confirm operators |
| [00-kernel.md](packages/layers/control-plane/docs/00-kernel.md) | **Irreducible kernel spec** — the canonical lawbook | Need the vertical-agnostic normative core |
| [01-spec.md](packages/layers/control-plane/docs/01-spec.md) | Dearbitrized formal specification (mailbox vertical) | Need to understand the mailbox-specific theoretical model |
| [02-architecture.md](packages/layers/control-plane/docs/02-architecture.md) | Component layers, data flow, interfaces | Want to understand how the system is organized |
| [03-persistence.md](packages/layers/control-plane/docs/03-persistence.md) | Filesystem layout, atomic writes, crash recovery | Need to understand storage or debug data issues |
| [04-identity.md](packages/layers/control-plane/docs/04-identity.md) | Event IDs, stable serialization, content hashing | Are working with event identity or deduplication |
| [05-testing.md](packages/layers/control-plane/docs/05-testing.md) | Test strategy, patterns, crash simulation | Are writing or debugging tests |
| [06-configuration.md](packages/layers/control-plane/docs/06-configuration.md) | Schema, auth methods, environment variables | Need to configure or deploy the system |
| [07-graph-adapter.md](packages/layers/control-plane/docs/07-graph-adapter.md) | Microsoft Graph API integration | Are working with the Graph API layer |
| [08-quickstart.md](packages/layers/control-plane/docs/08-quickstart.md) | Setup and first sync | Are setting up for the first time |
| [09-troubleshooting.md](packages/layers/control-plane/docs/09-troubleshooting.md) | Common issues and solutions | Are debugging a problem |
| [10-ui-read-model-audit.md](packages/layers/control-plane/docs/10-ui-read-model-audit.md) | UI read surfaces, gaps, and authority rules | Are building operator UI |
| [runtime-usc-boundary.md](docs/concepts/runtime-usc-boundary.md) | Runtime / USC / operator ownership boundary | Need to understand which layer owns what |
| [runtime-usc-boundary.md §Language / Runtime Posture](docs/concepts/runtime-usc-boundary.md#language--runtime-posture) | TypeScript posture vs durable authority boundaries | Need to decide whether types, schemas, runtime checks, or another language own a concern |
| [command-execution-intent-zone.md](docs/concepts/command-execution-intent-zone.md) | Command Execution Intent Zone — governed non-test command execution boundary | Need to separate command request, execution, result, and output admission |
| [cloudflare-site-materialization.md](docs/deployment/cloudflare-site-materialization.md) | Cloudflare Site materialization design | Designing or deploying a Cloudflare-backed Narada Site |
| [bootstrap-contract.md](docs/product/bootstrap-contract.md) | Canonical intent-to-operation bootstrap path | Setting up or onboarding a first-time user |
| [site-bootstrap-contract.md](docs/product/site-bootstrap-contract.md) | Canonical Site first-run path (runtime locus setup) | Setting up a local Site on Windows, macOS, or Linux |
| [tool-catalog-binding.md](docs/product/tool-catalog-binding.md) | Tool Locality Doctrine and operation-to-system tool binding | Binding diagnostic tools from an app/system repo into an operation |
| [first-operation-proof.md](docs/product/first-operation-proof.md) | Canonical mailbox operation product proof | Understanding what is proven and how to verify it |
| [operator-loop.md](docs/product/operator-loop.md) | Minimal operator rhythm for live operations | Running day-to-day operations |

---

## Where to Find Things

### By Task

| I want to... | Look In |
|--------------|---------|
| Change event ID computation | [`src/ids/event-id.ts`](packages/layers/control-plane/src/ids/event-id.ts) |
| Add a new persistence store | [`src/persistence/`](packages/layers/control-plane/src/persistence/) + see [03-persistence.md](packages/layers/control-plane/docs/03-persistence.md) |
| Modify task governance domain law | [`@narada2/task-governance`](packages/task-governance/README.md) |
| Modify the sync loop | [`src/runner/sync-once.ts`](packages/layers/control-plane/src/runner/sync-once.ts) |
| Add a CLI command | [`packages/layers/cli/src/commands/`](packages/layers/cli/src/commands/) |
| Change Graph API handling | [`src/adapter/graph/`](packages/layers/control-plane/src/adapter/graph/) |
| Change coordinator SQLite schema | [`src/coordinator/store.ts`](packages/layers/control-plane/src/coordinator/store.ts) |
| Recover control plane from facts | [`src/commands/recover.ts`](packages/layers/cli/src/commands/recover.ts) + [`src/foreman/facade.ts`](packages/layers/control-plane/src/foreman/facade.ts) |
| Modify work item lifecycle | [`src/scheduler/scheduler.ts`](packages/layers/control-plane/src/scheduler/scheduler.ts) |
| Modify continuation affinity / routing preference | [`src/coordinator/types.ts`](packages/layers/control-plane/src/coordinator/types.ts) + [`src/foreman/facade.ts`](packages/layers/control-plane/src/foreman/facade.ts) + [`src/scheduler/scheduler.ts`](packages/layers/control-plane/src/scheduler/scheduler.ts) |
| Modify foreman work opening | [`src/foreman/facade.ts`](packages/layers/control-plane/src/foreman/facade.ts) |
| Modify outbound handoff | [`src/foreman/handoff.ts`](packages/layers/control-plane/src/foreman/handoff.ts) |
| Change outbound command state machine | [`src/outbound/types.ts`](packages/layers/control-plane/src/outbound/types.ts) |
| Add an outbound command | [`src/outbound/store.ts`](packages/layers/control-plane/src/outbound/store.ts) |
| Modify send-reply worker | [`src/outbound/send-reply-worker.ts`](packages/layers/control-plane/src/outbound/send-reply-worker.ts) |
| Modify reconciler | [`src/outbound/reconciler.ts`](packages/layers/control-plane/src/outbound/reconciler.ts) |
| Run confirmation replay | [`src/executors/confirmation-replay.ts`](packages/layers/control-plane/src/executors/confirmation-replay.ts) |
| Rebuild projections | [`src/observability/rebuild.ts`](packages/layers/control-plane/src/observability/rebuild.ts) + [`narada rebuild-projections`](packages/layers/cli/src/commands/rebuild-projections.ts) |
| Modify non-send worker | [`src/outbound/non-send-worker.ts`](packages/layers/control-plane/src/outbound/non-send-worker.ts) |
| Bootstrap a new operation | [`docs/product/bootstrap-contract.md`](docs/product/bootstrap-contract.md) + [`packages/ops-kit/src/commands/init-repo.ts`](packages/ops-kit/src/commands/init-repo.ts) |
| Bootstrap a new Site | [`docs/product/site-bootstrap-contract.md`](docs/product/site-bootstrap-contract.md) + [`packages/layers/cli/src/commands/sites.ts`](packages/layers/cli/src/commands/sites.ts) |
| Render task graph as Mermaid | [`packages/layers/cli/src/commands/task-graph.ts`](packages/layers/cli/src/commands/task-graph.ts) + [`packages/layers/cli/src/lib/task-graph.ts`](packages/layers/cli/src/lib/task-graph.ts) |
| Run the canonical product proof | [`docs/product/first-operation-proof.md`](docs/product/first-operation-proof.md) + [`test/integration/live-operation/smoke-test.test.ts`](packages/layers/control-plane/test/integration/live-operation/smoke-test.test.ts) |
| Run the operator daily loop | [`docs/product/operator-loop.md`](docs/product/operator-loop.md) + [`narada ops`](packages/layers/cli/src/commands/ops.ts) |
| Add a new vertical source | [`src/sources/{vertical}-source.ts`](packages/layers/control-plane/src/sources/) |
| Add a context strategy | [`src/foreman/context.ts`](packages/layers/control-plane/src/foreman/context.ts) |
| Add a generic webhook HTTP server | [`packages/layers/daemon/src/generic-webhook-server.ts`](packages/layers/daemon/src/generic-webhook-server.ts) |
| Change charter runtime envelope | [`packages/domains/charters/src/runtime/envelope.ts`](packages/domains/charters/src/runtime/envelope.ts) |
| Add a charter runner | [`packages/domains/charters/src/runtime/runner.ts`](packages/domains/charters/src/runtime/runner.ts) |
| Add a tool catalog entry | [`packages/domains/charters/src/tools/resolver.ts`](packages/domains/charters/src/tools/resolver.ts) |
| Modify tool validation rules | [`packages/domains/charters/src/tools/validation.ts`](packages/domains/charters/src/tools/validation.ts) |
| Add a new field to messages | [`src/types/normalized.ts`](packages/layers/control-plane/src/types/normalized.ts) + [`src/normalize/message.ts`](packages/layers/control-plane/src/normalize/message.ts) |
| Modify config schema | [`src/config/types.ts`](packages/layers/control-plane/src/config/types.ts) + [`src/config/load.ts`](packages/layers/control-plane/src/config/load.ts) |
| Write integration tests | [`test/integration/`](packages/layers/control-plane/test/integration/) + see [05-testing.md](packages/layers/control-plane/docs/05-testing.md) |
| Modify crossing regime declaration | [`src/types/crossing-regime.ts`](packages/layers/control-plane/src/types/crossing-regime.ts) + [`SEMANTICS.md §2.15.8`](SEMANTICS.md) |
| Modify crossing regime kind taxonomy | [`src/types/crossing-regime.ts`](packages/layers/control-plane/src/types/crossing-regime.ts) + [`SEMANTICS.md §2.15.9`](SEMANTICS.md) |
| Modify crossing regime inventory | [`src/types/crossing-regime-inventory.ts`](packages/layers/control-plane/src/types/crossing-regime-inventory.ts) |
| Modify crossing regime lint gate | [`scripts/task-graph-lint.ts`](scripts/task-graph-lint.ts) + [`src/lib/task-governance.ts`](packages/layers/cli/src/lib/task-governance.ts) |
| Modify crossing regime construction surface | [`src/commands/chapter-init.ts`](packages/layers/cli/src/commands/chapter-init.ts) + [`src/lib/construction-loop-plan.ts`](packages/layers/cli/src/lib/construction-loop-plan.ts) + [`chapter-planning.md`](.ai/task-contracts/chapter-planning.md) |
| Modify zone template taxonomy | [`src/types/zone-template.ts`](packages/layers/control-plane/src/types/zone-template.ts) + [`SEMANTICS.md §2.17`](SEMANTICS.md) |
| Inspect crossing regimes | [`src/commands/crossing.ts`](packages/layers/cli/src/commands/crossing.ts) |

### By Concept

| Concept | Definition | Primary Location |
|---------|------------|------------------|
| **Delta Token** | URL/cursor from Graph API indicating sync position | [`src/persistence/cursor.ts`](packages/layers/control-plane/src/persistence/cursor.ts) |
| **Apply-Log** | Set of applied event IDs for idempotency | [`src/persistence/apply-log.ts`](packages/layers/control-plane/src/persistence/apply-log.ts) |
| **Tombstone** | Deletion marker for audit trails | [`src/persistence/tombstones.ts`](packages/layers/control-plane/src/persistence/tombstones.ts) |
| **Normalized Event** | Canonical representation of a Graph change | [`src/types/normalized.ts`](packages/layers/control-plane/src/types/normalized.ts) |
| **Stable Stringify** | Deterministic JSON serialization | [`src/ids/event-id.ts`](packages/layers/control-plane/src/ids/event-id.ts) |
| **Secure Storage** | OS keychain credential storage | [`src/auth/secure-storage.ts`](packages/layers/control-plane/src/auth/secure-storage.ts) |
| **Batch Sync** | Memory-efficient streaming sync | [`src/runner/batch-sync.ts`](packages/layers/control-plane/src/runner/batch-sync.ts) |
| **Circuit Breaker** | Failure rate protection | [`src/retry.ts`](packages/layers/control-plane/src/retry.ts) |
| **Health File** | Sync status persistence | [`src/health.ts`](packages/layers/control-plane/src/health.ts) |
| **conversation_id** | v2 canonical thread identifier (legacy `thread_id` exists in rollback tables only) | [`src/coordinator/types.ts`](packages/layers/control-plane/src/coordinator/types.ts) |
| **work_item** | Terminal schedulable unit of control work | [`src/coordinator/types.ts`](packages/layers/control-plane/src/coordinator/types.ts) |
| **execution_attempt** | Bounded charter invocation record | [`src/coordinator/types.ts`](packages/layers/control-plane/src/coordinator/types.ts) |
| **session** | `AgentSession` — operator-facing session with `resume_hint` | [`src/coordinator/types.ts`](packages/layers/control-plane/src/coordinator/types.ts) |
| **evaluation** | Persisted charter output for foreman governance | [`src/foreman/types.ts`](packages/layers/control-plane/src/foreman/types.ts) |
| **Lease** | Execution authority record for a work item | [`src/scheduler/scheduler.ts`](packages/layers/control-plane/src/scheduler/scheduler.ts) |
| **Foreman Decision** | Outbound proposal record | [`src/foreman/facade.ts`](packages/layers/control-plane/src/foreman/facade.ts) |
| **outbound command** | Durable mailbox mutation intent | [`src/outbound/types.ts`](packages/layers/control-plane/src/outbound/types.ts) |
| **ManagedDraft** | Graph draft bound to a command version | [`src/outbound/store.ts`](packages/layers/control-plane/src/outbound/store.ts) |
| **trace** | Commentary record (non-authoritative) anchored to `execution_id` | [`src/agent/traces/types.ts`](packages/layers/control-plane/src/agent/traces/types.ts) |
| **runtime policy** | Charter routing, allowed actions, and tool catalog binding | [`src/config/types.ts`](packages/layers/control-plane/src/config/types.ts) |
| **SendReplyWorker** | Draft creation, reuse, and send | [`src/outbound/send-reply-worker.ts`](packages/layers/control-plane/src/outbound/send-reply-worker.ts) |
| **OutboundReconciler** | Submitted → confirmed binding | [`src/outbound/reconciler.ts`](packages/layers/control-plane/src/outbound/reconciler.ts) |
| **CharterInvocationEnvelope** | Runtime envelope for charter evaluation | [`packages/domains/charters/src/runtime/envelope.ts`](packages/domains/charters/src/runtime/envelope.ts) |
| **ToolRunner** | Subprocess/HTTP tool execution | [`packages/domains/charters/src/tools/runner.ts`](packages/domains/charters/src/tools/runner.ts) |
| **authority class** | Policy-enforced capability classification (derive/propose/claim/execute/resolve/confirm/admin) | [`SEMANTICS.md`](SEMANTICS.md) |
| **selector** | Canonical read-only bound for operator input sets (scope, temporal, identity, status, vertical, limit, offset) | [`SEMANTICS.md §2.9`](SEMANTICS.md) |
| **promotion operator** | Explicit operator that advances artifacts through lifecycle transitions | [`SEMANTICS.md §2.10`](SEMANTICS.md) |
| **inspection operator** | Read-only operator that observes durable or derived state without mutation | [`SEMANTICS.md §2.11`](SEMANTICS.md) |
| **re-derivation operator** | Explicit operator that recomputes downstream state from durable boundaries | [`SEMANTICS.md §2.8`](SEMANTICS.md) |
| **replay derivation** | `Fact` → `Work` re-derivation using canonical context formation + foreman admission | [`SEMANTICS.md §2.8`](SEMANTICS.md) |
| **preview derivation** | `Fact` → `Evaluation` read-only inspection without work opening | [`SEMANTICS.md §2.8`](SEMANTICS.md) |
| **recovery derivation** | `Fact` → `Context`/`Work` control-plane reconstruction after loss | [`SEMANTICS.md §2.8`](SEMANTICS.md) |
| **projection rebuild** | `Durable state` → `Observation` non-authoritative derived view recomputation via `ProjectionRebuildRegistry` | [`SEMANTICS.md §2.8`](SEMANTICS.md) + [`src/observability/rebuild.ts`](packages/layers/control-plane/src/observability/rebuild.ts) |
| **confirmation replay** | `Execution` → `Confirmation` recomputation without re-performing effects | [`SEMANTICS.md §2.8`](SEMANTICS.md) |
| **advisory signals** | Non-authoritative hints that influence routing, timing, review, and attention without determining truth or permission | [`SEMANTICS.md §2.12`](SEMANTICS.md) |
| **authoritative structures** | Durable boundaries and authority classes that determine truth, permission, and commitment | [`SEMANTICS.md §2.12`](SEMANTICS.md) |
| **crossing regime** | Explicit set of rules governing what may cross a boundary, in what form, under what authority, and with what confirmation | [`SEMANTICS.md §2.15`](SEMANTICS.md) |
| **zone** | Region of authority homogeneity within which a single authority owner governs state and transitions | [`SEMANTICS.md §2.15`](SEMANTICS.md) |
| **boundary** | Interface between two adjacent zones where authority changes and a durable artifact is produced | [`SEMANTICS.md §2.15`](SEMANTICS.md) |
| **crossing artifact** | Durable record produced by a boundary crossing, carrying state from source zone to destination zone | [`SEMANTICS.md §2.15`](SEMANTICS.md) |
| **crossing regime declaration** | Canonical six-field contract (`source_zone`, `destination_zone`, `authority_owner`, `admissibility_regime`, `crossing_artifact`, `confirmation_rule`) that lint, inspection, and construction surfaces consume mechanically | [`SEMANTICS.md §2.15.8`](SEMANTICS.md) + [`src/types/crossing-regime.ts`](packages/layers/control-plane/src/types/crossing-regime.ts) |
| **crossing regime kind** | Reusable taxonomy of edge-law patterns (`self_certifying`, `policy_governed`, `intent_handoff`, `challenge_confirmed`, `review_gated`, `observation_reconciled`) that cluster concrete crossing declarations | [`SEMANTICS.md §2.15.9`](SEMANTICS.md) + [`src/types/crossing-regime.ts`](packages/layers/control-plane/src/types/crossing-regime.ts) |
| **crossing regime inventory** | Canonical initial inventory of declared crossings (canonical, advisory, deferred) against the Task 495 contract | [`src/types/crossing-regime-inventory.ts`](packages/layers/control-plane/src/types/crossing-regime-inventory.ts) |
| **crossing regime inspection** | Read-only CLI surface (`narada crossing list`, `narada crossing show`) over the canonical inventory | [`src/commands/crossing.ts`](packages/layers/cli/src/commands/crossing.ts) |
| **zone template** | Reusable pattern defined by invariant authority grammar that multiple zones may instantiate | [`SEMANTICS.md §2.17`](SEMANTICS.md) + [`src/types/zone-template.ts`](packages/layers/control-plane/src/types/zone-template.ts) |
| **zone template inventory** | Canonical inventory of zone templates with fit strength, instances, and ambiguity notes | [`src/types/zone-template.ts`](packages/layers/control-plane/src/types/zone-template.ts) |

---

## Quick Commands

```bash
# Install dependencies
pnpm install

# Build all packages (tsc)
pnpm build

# Type check (tsc --noEmit)
pnpm typecheck

# Fast local verification (typecheck + build + fast packages, ~15 sec)
pnpm verify

# Unit tests across all packages
pnpm test:unit

# Integration tests only
pnpm test:integration

# Focused test with telemetry recording
pnpm test:focused "pnpm --filter <pkg> exec vitest run <path>"

# Package-scoped tests
pnpm test:control-plane
pnpm test:daemon

# Full recursive test suite (requires explicit opt-in)
ALLOW_FULL_TESTS=1 pnpm test:full

# Run benchmarks
pnpm benchmark

# Compare benchmarks with baseline
pnpm benchmark:compare

# Pre-publish checks
pnpm prepublish-check

# Recover control-plane state from facts after coordinator loss
narada recover --scope <scope-id>

# Preview what recovery would do without mutating
narada recover --scope <scope-id> --dry-run

# Replay derivation (re-derive work from stored facts)
narada derive-work --scope <scope-id>

# Render task graph as Mermaid (read-only inspection)
narada task graph --format mermaid

# Render task graph as JSON
narada task graph --format json --range 429-454
```

### `recover` vs `derive-work`

Both commands rebuild control-plane state from stored facts, but they are distinct surfaces:

| Command | Surface | Intent | Authority |
|---------|---------|--------|-----------|
| `narada recover` | `recoverFromStoredFacts()` | Loss-shaped recovery after coordinator loss | `admin` |
| `narada derive-work` | `deriveWorkFromStoredFacts()` | Operator-scoped replay for testing/policy | `derive` + `resolve` |

**Shared core**: Both route through the same `onContextsAdmitted()` derivation core. The distinction is in naming, triggering context, and intended authority — not in divergent runtime behavior.

### Task Completion Semantics

The CLI distinguishes four levels of completion. Agents and operators must not conflate them:

| Level | What it means | How to check |
|-------|---------------|--------------|
| **Agent attempt done** | The agent's roster entry is `done` (`task roster done`). | `narada task roster show` |
| **Task has evidence** | The task file contains execution notes, checked acceptance criteria, and ideally a WorkResultReport. | `narada task evidence <n>` |
| **Tasks not complete by evidence** | Lists tasks that are incomplete, attempt-complete, needs-review, or needs-closure across the repo. | `narada task evidence list` |
| **Task artifact closed** | The task file front matter says `status: closed` (or `confirmed`). | `narada task read <n>` |
| **Chapter ready to advance** | All tasks in the chapter are `closed` or `confirmed`, with reviews/closure decisions where required. | `narada chapter close` |

**Key rules:**
- `task roster done` marks only agent availability, not task completion. It blocks by default when the task is not complete by evidence. Use `--allow-incomplete` only when intentionally recording agent availability while preserving the task as incomplete.
- `task review accepted` does **not** transition a task to `closed` if acceptance criteria are unchecked or execution evidence is missing. The task stays `in_review` until evidence is provided.
- `narada task evidence <n>` is read-only and classifies a single task as `complete`, `attempt_complete`, `needs_review`, `needs_closure`, or `incomplete`.
- `narada task evidence list` is read-only and lists all tasks that are not complete by evidence (default filter). Use `--verdict` to filter, `--status` to scope by front-matter status, and `--range` for number ranges.

### Task Lifecycle Transition Map

All normal transitions are command-mediated. Direct status editing in markdown or SQLite is classified as debug/maintenance only.

| From | To | Command | Path type |
|------|-----|---------|-----------|
| `opened` | `claimed` | `narada task claim <n> --agent <id>` | Normal |
| `opened` | `closed` | `narada task close <n> --by <id>` | Normal (operator skip-review) |
| `claimed` | `in_review` | `narada task report <n> --agent <id> --summary "..."` | Normal |
| `claimed` | `opened` | `narada task release <n> --reason abandoned\|superseded\|transferred` | Normal |
| `claimed` | `needs_continuation` | `narada task release <n> --reason budget_exhausted` | Normal |
| `needs_continuation` | `claimed` | `narada task continue <n> --agent <id> --reason <r>` | Normal |
| `in_review` | `closed` | `narada task review <n> --verdict accepted` | Normal (peer review) |
| `in_review` | `opened` | `narada task review <n> --verdict rejected` | Normal |
| `closed` | `confirmed` | `narada task confirm <n> --by <id>` | Normal (individual finalization) |
| `closed` | `confirmed` | `narada chapter close` | Normal (batch finalization) |
| `closed` | `opened` | `narada task reopen <n> --by <id>` | Exceptional (repair) |
| `closed` | `in_review` | `narada task reopen <n> --by <id>` | Exceptional (repair, has review) |
| `confirmed` | `opened` | `narada task reopen <n> --by <id> --force` | Exceptional (repair) |

**Orchestrator, not transition:** `task finish` is a convenience orchestrator that calls `task report`, `task review`, and `task roster done` in sequence. It does not introduce new lifecycle transitions.

**Redundancy resolved:** `task close` and `task review --verdict accepted` both can reach `closed` from `in_review`. This is intentional — operator closure and peer review closure are distinct authority paths.

**Bounded exceptional paths:**
- `needs_continuation → opened`: No direct command. Use `task continue` → `task release --reason abandoned`. Classified as exceptional.
- `draft → opened`: `task create` produces `opened` directly. `draft` is a pre-creation placeholder, not a normal lifecycle state.
- `confirmed → in_review`: Use `task reopen --force`. Classified as exceptional.

### Task Assignment and Claim Semantics

| Operator | What it does | Mutates task file? | Mutates roster? |
|----------|-------------|-------------------|-----------------|
| `task roster add <agent-id>` | Enrolls an agent in the roster projection | No | Yes (`idle`, no task) |
| `task roster assign <n> --agent <id>` | Assigns agent to task **and claims it by default** | Yes (status → `claimed`) | Yes (`working` + task) |
| `task roster assign <n> --agent <id> --no-claim` | Assigns agent without claiming | No | Yes (`working` + task) |
| `task claim <n> --agent <id>` | Claims task directly (no roster update except `last_active_at`) | Yes (status → `claimed`) | No (only timestamp) |
| `task roster done <n> --agent <id>` | Marks agent done only if required evidence exists | No | Yes (`done`, clears task) |
| `task roster done <n> --agent <id> --allow-incomplete` | Records agent availability despite missing evidence | No | Yes (`done`, clears task) |
| `task finish <n> --agent <id>` | Canonical completion: report/review → evidence → roster done | Yes (report/review) | Yes (`done`, clears task) |
| `task continue <n> --agent <id> --reason <r>` | Continue/take over an already-claimed task | Yes (status → `claimed` if `needs_continuation`) | Yes (`working` + task) |
| `task review <n> --verdict accepted` | Reviews and may close task | Yes (status → `closed` or stays `in_review`) | No |

**Atomicity:** `roster assign` validates claimability (task exists, status is `opened`/`needs_continuation`, dependencies met, no active assignment) **before** touching the roster. A failed validation leaves both the roster and the task file unchanged. If the task is already `claimed`, the roster is updated and a warning is emitted (non-destructive).

**Continuation / Takeover (`task continue`):**
- Valid only for tasks with status `claimed` or `needs_continuation`.
- `opened` tasks must use `task claim` or `task roster assign` instead.
- Supported reasons:
  - `evidence_repair` — continuation agent assists without superseding primary; prior assignment stays active.
  - `review_fix` — continuation agent addresses review findings without superseding primary.
  - `handoff` — explicit transfer; prior assignment is released as `continued`.
  - `blocked_agent` — prior agent is blocked; prior assignment is released as `continued`.
  - `operator_override` — operator directive; prior assignment is released as `continued`.
- Assignment history is append-only; prior assignments are never erased.
- `task report` accepts reports from both primary and continuation agents. A continuation report does not release the primary assignment or transition task status.

**Conservative guarantees** (both commands):
- No active leases are created
- No in-flight execution attempts are resurrected
- No outbound confirmations are fabricated

**What is NOT recoverable from facts alone**:
- Active leases — must be re-acquired by scheduler
- In-flight execution attempts — must be restarted by runner
- Submitted outbound effects — confirmation requires inbound reconciliation
- Operator action request history
- Agent traces (non-authoritative, rebuildable via projection rebuild)

---

**Package Management**: Uses [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
# Add a changeset
pnpm changeset

# Version packages  
pnpm version-packages

# Publish (CI handles this)
pnpm release
```

---

## Repository Layout

```
narada/
├── AGENTS.md                          # This file (navigation hub)
├── packages/
│   ├── layers/control-plane/          # Core library (control plane)
│   │   ├── AGENTS.md                  # Package-specific agent guidance
│   │   ├── config.example.json        # Configuration template
│   │   ├── docs/                      # Numbered documentation
│   │   │   ├── 01-spec.md
│   │   │   ├── 02-architecture.md
│   │   │   └── ...
│   │   ├── src/
│   │   │   ├── adapter/graph/         # Microsoft Graph API client
│   │   │   ├── auth/                  # Secure credential storage
│   │   │   ├── config/                # Configuration loading
│   │   │   ├── ids/                   # Event ID generation
│   │   │   ├── logging/               # Structured logging
│   │   │   ├── normalize/             # Graph → normalized conversion
│   │   │   ├── persistence/           # Filesystem storage
│   │   │   ├── projector/             # Event application
│   │   │   ├── recovery/              # Crash recovery
│   │   │   ├── runner/                # Sync orchestration
│   │   │   └── types/                 # TypeScript definitions
│   │   └── test/
│   │       ├── benchmarks/            # Performance benchmarks
│   │       ├── integration/           # End-to-end tests
│   │       ├── unit/                  # Component tests
│   │       └── windows/               # Windows-specific tests
│   │
│   ├── layers/cli/                    # Command-line interface
│   │   └── src/
│   │       ├── commands/              # CLI commands
│   │       ├── lib/                   # Shared utilities
│   │       └── main.ts                # Entry point
│   │
│   ├── layers/daemon/                 # Long-running daemon
│   ├── verticals/search/              # Full-text search (FTS5)
│   └── charters/                      # Charter definitions and policy types
│
├── scripts/                           # Build and utility scripts
└── .github/workflows/                 # CI/CD pipelines
```

---

## Critical Invariants (Must Never Violate)

### Inbound
1. **No Loss After Commit**: `cursor = c` ⇒ all events ≤ c have been applied
2. **Replay Safety**: `apply(e)` multiple times ⇒ same final state
3. **Determinism**: `normalize(remote_data)` produces identical output for identical input
4. **Idempotency Boundary**: Enforced at `event_id` → `apply_log`
5. **Apply Ordering**: `apply(e)` → `mark_applied(e)` → `cursor_commit` (never reorder)

### Control Plane
6. **Foreman owns work opening**: Only `DefaultForemanFacade.onSyncCompleted()` (or `onFactsAdmitted()`) may insert `work_item` rows. Both delegate to a private `onContextsAdmitted()` that performs the actual insert. Replay derivation from stored facts routes through the same `onContextsAdmitted()` path.
6a. **Re-derivation is explicit and bounded**: No family member (replay, preview, recovery, rebuild, confirm) may run automatically on normal daemon startup. All require explicit operator trigger with bounded selection (scope, context, time range, or fact set).
6b. **No admission side effect in replay**: Replay derivation must not mark facts as `admitted`. Fact lifecycle transitions are the exclusive concern of live dispatch.
7. **Foreman owns evaluation resolution**: Only `DefaultForemanFacade.resolveWorkItem()` may transition a `work_item` to `resolved` based on charter output and policy governance. It does not handle runtime or execution failures.
8. **Foreman owns failure classification**: Only `DefaultForemanFacade.failWorkItem()` may transition a `work_item` to `failed_retryable` or `failed_terminal`. The scheduler releases leases and marks execution attempts crashed; the foreman classifies the semantic failure and applies retry backoff.
9. **Scheduler owns leases and mechanical lifecycle**: Only `SqliteScheduler` may insert/release `work_item_leases` and transition a work item into `leased` or `executing`. The scheduler may mark execution attempts as crashed/abandoned and release leases, but it does **not** semantically classify work-item failure status.
10. **IntentHandoff owns intent creation**: Only `IntentHandoff.admitIntentFromDecision()` may create `intent` rows. It is called from within the foreman's atomic decision transaction.
11. **OutboundHandoff owns command creation**: All `outbound_commands` + `outbound_versions` must be created inside `OutboundHandoff.createCommandFromDecision()` (atomic with decision insert).
12. **Outbound workers own mutation**: Only the outbound worker layer may call the source adapter to create drafts / send messages / move items.
13. **Charter runtime is read-only sandbox**: It may only read the `CharterInvocationEnvelope` and produce a `CharterOutputEnvelope`. It must NOT write to coordinator or outbound stores directly.
14. **Work Object Authority**: A `work_item` is the terminal generalized schedulable unit (kernel fields: `context_id`, `scope_id`); at most one non-terminal work item per context may be `leased` or `executing`
15. **Lease Uniqueness**: A work item has at most one unreleased, unexpired lease at any time
16. **Bounded Evaluation**: Charters run inside frozen `CharterInvocationEnvelope`s with immutable capability envelopes
17. **Decision Before Command**: `foreman_decision` is append-only; `outbound_command` is worker-mutable; one decision produces at most one command
18. **Authority Class Enforcement**: Every tool binding and charter capability must declare an authority class. Preflight rejects configs that bind a charter or tool to an authority class it is not allowed to use. Domain packs may only declare `derive` and `propose`. Only Narada runtime-authorized components may declare `claim`, `execute`, `resolve`, or `confirm`. `admin` requires explicit operator/admin posture.

### Observation / UI
19. **Observation is read-only projection**: `layers/control-plane/src/observability/` must never contain writes (`.run(`, `.exec(`, direct mutation calls). It derives its data exclusively from durable stores. Inspection requires no authority class.
20. **Control surface is explicitly separated**: Operator actions are mounted under `/control/scopes/:scope_id/actions`. The observation namespace (`/scopes/...`) is strictly GET-only.
21. **UI cannot become hidden authority**: The operator console (`layers/daemon/src/ui/`) may only mutate through the audited, safelisted `executeOperatorAction()` path in `operator-actions.ts`. Every action is logged to `operator_action_requests`. Direct store mutations from the observation API are forbidden.
21a. **Email cannot become operator authority**: Email-originated operator requests may only create pending audited `operator_action_requests`. No email `From:` header, mailbox rule, or message body may directly approve send, execute a tool, mutate config, close a task, or perform any control action. Confirmation requires a configured identity provider challenge and then the canonical `executeOperatorAction()` path.
22. **Observation API uses view types**: `ObservationApiScope` exposes only `*View` / `*OperatorView` store interfaces, removing named mutation methods at the type level.
23. **All UI data sources are classified**: Every observation type is marked as `authoritative` (mirrors one durable row), `derived` (computed from multiple sources), or `decorative` (presentational only).

### Do Not Regress These Boundaries (Task 085)
24. **No mailbox leakage into generic observation**: `conversation_id` and `mailbox_id` must not appear in generic observability types/queries. They are allowed only inside mail-specific types (`MailExecutionDetail`, `MailboxVerticalView`) and mail-specific query functions (`getMailboxVerticalView`, `getMailExecutionDetails`).
25. **Observation queries are SELECT-only**: Files in `layers/control-plane/src/observability/` must not contain `.run(` or `.exec(`. Only `.all(`, `.get(`, and `.pluck(` are permitted.
26. **Control endpoints stay in `/control/`**: No POST route may be registered under `/scopes/...` in the observation namespace. The action route must remain under `/control/scopes/:scope_id/actions`.
27. **UI shell stays vertical-neutral**: The top-level nav menu must not contain mail-specific labels (e.g., "Mailbox"). Mail-specific views must live under the "Verticals" page, not as primary navigation.

### Kernel Substrate vs Mailbox Vertical Boundary (Task 087)
28. **Neutral tables are the kernel substrate**: `context_records`, `context_revisions`, and `outbound_handoffs` are the canonical durable base tables. All generic writes and generic reads must target them directly.
29. **Mailbox-era schema is vertical-local compatibility only**: `conversation_records`, `conversation_revisions`, and `outbound_commands` are compatibility views projecting mailbox-era column names (`conversation_id`, `mailbox_id`) from the neutral tables. They may only be referenced inside mailbox-vertical modules (`adapter/graph/`, `normalize/`, `projector/`, `foreman/`, `outbound/` worker code) or explicit migration/compatibility adapters.
30. **Generic modules must not query mailbox-era views**: Control-plane modules (`scheduler/`, `facts/`, `intent/`, `sources/`, `executors/`, `charter/`, `observability/`) must not contain SQL references to `conversation_records`, `conversation_revisions`, or `outbound_commands`. CI enforces this via `scripts/control-plane-lint.ts`.
31. **Mailbox compatibility is additive, not foundational**: New verticals must build against `context_id`/`scope_id` and `outbound_handoffs`. They must never depend on mailbox-era naming or views.

### Outbound
32. **Draft-First Delivery**: Agents and workers never send directly; they always create a draft first
33. **Two-Stage Completion**: A command reaches `submitted` when Graph accepts it, and `confirmed` only after inbound reconciliation observes the result
34. **No External Draft Mutation**: Modification of a managed draft by anything other than the outbound worker is a hard failure
35. **Worker Exclusivity**: Only the outbound worker may create or mutate managed drafts

### Advisory Signals (Task 214)
36. **Advisory signals are non-authoritative**: Removing every advisory signal from the system must leave all durable boundaries intact and all authority invariants satisfiable.
37. **Advisory signals are overrideable**: Any component that consumes an advisory signal must have a sensible fallback when the signal is absent, contradictory, or stale.
38. **Advisory signals have no lifecycle side effect**: Emitting or consuming an advisory signal must not transition the lifecycle state of a durable object (fact, work item, intent, execution).
39. **Continuation affinity is advisory**: `WorkItem` may carry `continuation_affinity` fields (`preferred_session_id`, `affinity_strength`, `affinity_expires_at`), but the scheduler must treat them as a reordering hint, not a mandatory assignment. Affinity must not bypass leasing, override governance, or block runnable work indefinitely.
40. **Advisory signals make no truth claim**: An advisory signal must never be presented as evidence that something is true; it only expresses preference, probability, or attention-worthiness.

### Crossing Regime (Task 491)
41. **No crossing without regime**: Every zone-to-zone boundary crossing that produces a durable artifact must have an explicit crossing regime (source zone, destination zone, authority owner, admissibility regime, crossing artifact, confirmation rule).
42. **Authority changes at boundaries**: If a transition does not change authority owner, it is not a boundary crossing — it is an internal state transition within a zone.
43. **Artifacts are durable**: A crossing artifact must be durable enough to survive a crash in either zone. Ephemeral signals do not qualify as crossing artifacts.
44. **Confirmation is downstream or self-certifying**: Every crossing either carries its own proof (content hash) or defines how it will be confirmed later (reconciliation, review, challenge, inbound observation).
45. **Regimes are not transitive shortcuts**: Crossing regimes compose sequentially, not by skipping zones. `Source → Fact → Context → Work` is valid; `Source → Work` is an authority collapse.

### Speaking Doctrine (Task 502)

Narada adopts a disciplined way of speaking about architecture, borrowed from BSFG where it strengthens clarity and rejected where it would cause semantic smear.

#### Role vs Implementation

A **role** is what a component must do (authority, invariant, obligation). An **implementation** is how it does it (code, process, substrate).

| Role | Example Implementations |
|------|------------------------|
| Source adapter (`derive`) | Graph API client, filesystem watcher, timer trigger, webhook receiver |
| Foreman (`resolve`) | SQLite-backed scheduler, Cloudflare Durable Object, in-memory test harness |
| Worker (`execute`) | Send-reply worker, process runner, future automation executor |

> **Rule**: When describing a boundary, name the role and authority class first. Name the implementation only when substrate specificity matters.

#### Three-Layer Ontology

Every architectural statement belongs to one of three layers:

| Layer | Contains | Does NOT contain |
|-------|----------|------------------|
| **Principle** | Zones, regimes, invariants, authority grammars | Services, languages, deployable artifacts |
| **Logical System** | Control plane, operators, state machines, CLI | Substrate-specific APIs, deployment details |
| **Substrate** | SQLite, filesystem, Cloudflare, Windows, R2 | Authority boundaries, crossing regimes |

> **Rule**: Do not identify Narada with its substrate. SQLite is a substrate, not Narada. TypeScript is the current implementation language, not the authority boundary.

#### Named Operational Modes

Narada operates in explicit modes. Name the mode when describing behavior:

| Mode | When Active | Key Guarantee |
|------|-------------|---------------|
| **Live** | Normal operation | All authority transitions are durable and real |
| **Replay Derivation** | `narada derive-work`, `narada recover` | No new facts admitted; reconstructs from stored artifacts |
| **Preview Derivation** | `narada preview-work` | Read-only computation; no work opened, no intents created |
| **Recovery** | Post-coordinator-loss reconstruction | Facts are authoritative starting point; no in-flight executions resurrected |
| **Inspection** | `narada status`, `narada show`, `narada crossing list` | No durable mutation; no leases; no effects |

> **Rule**: Do not assume "live" as the default. A command or surface must declare its mode explicitly.

#### Canonical Naming Grammar

Narada identifiers follow these principles:

| Pattern | Example | Use For |
|---------|---------|---------|
| `lower_snake_case` | `source_adapter`, `foreman_decision` | Code identifiers, config keys, fact predicates |
| `kebab-case` | `crossing-regime`, `task-attachment` | File names, CLI commands, URL paths |
| `PascalCase` | `CrossingRegime`, `TaskAssignment` | TypeScript types, interfaces, classes |
| `SCREAMING_SNAKE_CASE` | `CROSSING_REGIME_INVENTORY` | Constants, enums, environment variables |
| `lower.kind:id` | `mail:thread_abc123` | Subject identifiers in facts |

> **Rule**: Past tense for predicates (`order_created`, not `create_order`). Specific verbs (`shipped`, `confirmed`, not `updated`). Stable once deployed.

#### Irreducible Semantic Units

Every first-class concept in Narada must be stateable as an irreducible unit:

- A **zone** is a region where one authority grammar remains invariant.
- A **crossing regime** is the explicit set of rules that determine what may cross a boundary, in what form, under what authority, and with what confirmation obligation.
- A **governed crossing** is the admissible, durable transfer from one zone to another under an explicit crossing regime.

> **Rule**: If a concept cannot be stated in one sentence without referencing implementation details, it is not yet a first-class semantic unit.

#### Short Invariant Bullets

Invariants are stated as short, load-bearing bullets:

> **No meaningful boundary crossing without an explicit admissibility regime.**
> **Intelligence may contribute judgment. Authority must remain in governed structure.**
> **Removing every advisory signal from the system must leave all durable boundaries intact.**

> **Rule**: An invariant must fit on one line. If it needs a paragraph, it is a design note, not an invariant.

#### What Was Rejected from BSFG

| BSFG Concept | Rejected Because | Narada Equivalent |
|--------------|------------------|-------------------|
| Four-buffer model (ISB/IFB/ESB/EFB) | Narada is authority-first, not connectivity-first | Crossing regime + zone topology |
| IT/OT zone language | Manufacturing-specific; would smear into Narada's vertical-neutral kernel | Generic zone + vertical taxonomy |
| Message/envelope as universal primary frame | Narada's fact is one artifact among many; not all boundaries carry messages | Crossing artifact (varies by boundary) |
| Connectivity-first topology | Narada's topology is defined by authority change, not network connectivity | Authority-homogeneous zones |
| `putIfAbsent` forward buffer deduplication | Substrate-specific implementation detail | Idempotency enforced at `event_id` → `apply_log` |

---

## Secret Resolution Precedence

Configuration values that involve secrets follow a deterministic precedence:

1. **Environment variables** (highest precedence)
2. **Secure storage references** (`{ "$secure": "key" }`)
3. **Config file values** (lowest precedence)

### Graph API Credentials
| Source | Env Var | Config Key |
|--------|---------|------------|
| Access token | `GRAPH_ACCESS_TOKEN` | `graph.access_token` (via secure ref) |
| Tenant ID | `GRAPH_TENANT_ID` | `graph.tenant_id` |
| Client ID | `GRAPH_CLIENT_ID` | `graph.client_id` |
| Client Secret | `GRAPH_CLIENT_SECRET` | `graph.client_secret` |

Resolved in `buildGraphTokenProvider()`.

### Charter Runtime API Key
| Source | Env Var | Config Key |
|--------|---------|------------|
| OpenAI API key | `NARADA_OPENAI_API_KEY` or `OPENAI_API_KEY` | `charter.api_key` |

Resolved in `validateCharterRuntimeConfig()`.

### Secure Storage
- `loadConfig()` and `loadMultiMailboxConfig()` accept an optional `storage: SecureStorage` parameter.
- If `{ "$secure": "key" }` references exist and no storage is provided, loading throws before any side effects.
- The CLI and daemon currently do not wire secure storage automatically; callers must explicitly provide it.

---

## Extension Points

**Allowed** (preserves invariants):
- New vertical sources (filesystem, webhook, API)
- New fact types
- New context formation strategies
- New executor families
- Richer payloads (attachments, html)
- Stronger integrity checks
- Multi-folder support (requires explicit redesign)
- Alternative projections (search index, analytics)
- New outbound actions via the durable intent pipeline

**Disallowed** without full redesign:
- Implicit deletes
- Cursor-first commit
- Non-deterministic normalization
- Externalized apply-log
- Direct writes to `work_item`, `work_item_leases`, or `execution_attempts` from outside `ForemanFacade` / `Scheduler`
- Bypassing `OutboundHandoff` to create `outbound_command` rows
- Charter runtimes that mutate coordinator or outbound stores directly

---

## Common Modifications

### 1. Add a New Field to NormalizedMessage

1. Add field to [`NormalizedPayload`](packages/layers/control-plane/src/types/normalized.ts)
2. Extract/transform in [`src/normalize/message.ts`](packages/layers/control-plane/src/normalize/message.ts)
3. Update [`FileMessageStore.upsertFromPayload()`](packages/layers/control-plane/src/persistence/messages.ts) if persistence needs change
4. Add test in [`test/unit/normalize/message.test.ts`](packages/layers/control-plane/test/unit/normalize/message.test.ts)

### 2. Add a New Persistence Store

1. Define interface in [`src/types/runtime.ts`](packages/layers/control-plane/src/types/runtime.ts) (if not existing)
2. Implement in [`src/persistence/{name}.ts`](packages/layers/control-plane/src/persistence/)
3. Follow atomic write pattern (write to tmp, rename)
4. Add unit tests in [`test/unit/persistence/{name}.test.ts`](packages/layers/control-plane/test/unit/)

### 3. Handle a New Graph API Error

1. Add error classification in [`src/adapter/graph/client.ts`](packages/layers/control-plane/src/adapter/graph/client.ts)
2. Map to `retryable_failure` or `fatal_failure` in [`src/runner/sync-once.ts`](packages/layers/control-plane/src/runner/sync-once.ts)
3. Add test case in [`test/integration/`](packages/layers/control-plane/test/integration/)

### 4. Add a CLI Command

1. Create [`packages/layers/cli/src/commands/{command}.ts`](packages/layers/cli/src/commands/)
2. Wire up in [`packages/layers/cli/src/main.ts`](packages/layers/cli/src/main.ts)
3. Export types from [`packages/layers/cli/src/index.ts`](packages/layers/cli/src/index.ts)
3. Use [`loadConfig()`](packages/layers/control-plane/src/config/load.ts) for config handling

### 5. Add a New Non-Mail Vertical

The kernel supports arbitrary verticals through the same Source → Fact → Policy → Intent → Execution spine. To add one (e.g., filesystem, webhook, API):

1. Implement `Source` in [`src/sources/{vertical}-source.ts`](packages/layers/control-plane/src/sources/)
2. Add fact type to [`src/facts/types.ts`](packages/layers/control-plane/src/facts/types.ts) and mapping in [`src/facts/record-to-fact.ts`](packages/layers/control-plane/src/facts/record-to-fact.ts)
3. Add `ContextFormationStrategy` in [`src/foreman/context.ts`](packages/layers/control-plane/src/foreman/context.ts)
4. Provide a projector (may be no-op for non-filesystem verticals)
5. Wire executor family in intent handoff if the vertical produces effects
6. Add unit + integration tests proving replay safety and idempotency
7. Update this AGENTS.md to list the new vertical as a peer

### 6. Change Policy Binding

Runtime policy determines charter routing, allowed actions, and tool catalog for a scope. To modify:

1. Update [`RuntimePolicy`](packages/layers/control-plane/src/config/types.ts) type
2. Update parsing/defaults in [`src/config/load.ts`](packages/layers/control-plane/src/config/load.ts) and [`src/config/defaults.ts`](packages/layers/control-plane/src/config/defaults.ts)
3. Update consumers: [`DefaultForemanFacade`](packages/layers/control-plane/src/foreman/facade.ts), [`buildInvocationEnvelope`](packages/layers/control-plane/src/charter/envelope.ts), and daemon [`service.ts`](packages/layers/daemon/src/service.ts)
4. Update [`config.example.json`](packages/layers/control-plane/config.example.json)
5. Add tests in [`test/unit/config/load.test.ts`](packages/layers/control-plane/test/unit/config/load.test.ts) and [`test/integration/policy-routing.test.ts`](packages/layers/daemon/test/integration/policy-routing.test.ts)

**Tool locality invariant:** Do not copy system diagnostic tools into an ops repo. System repos own tool implementation (`.narada/tool-catalog.json`, scripts, `.env` naming, schema assumptions); operation repos own permission binding (`allowed_tools`, charter policy); Narada runtime owns mediation, audit, timeout, and authority enforcement. See [`SEMANTICS.md`](SEMANTICS.md) and [`docs/product/tool-catalog-binding.md`](docs/product/tool-catalog-binding.md).

### 7. Work with the USC Schema Cache

The USC schema cache provides offline resilience for validation and read-only operations when `@narada.usc/*` packages are not installed.

**Location:** [`packages/layers/cli/src/lib/usc-schema-cache.ts`](packages/layers/cli/src/lib/usc-schema-cache.ts)

**How it works:**
- `narada init usc` populates `.ai/usc-schema-cache/` with JSON schemas discovered in the USC installation
- If USC packages are missing at runtime, tools can fall back to cached schemas via `getCachedSchemaPath()`, `readCachedSchema()`, or `listCachedSchemas()`

**When to update:**
- When adding new USC schema consumers that need offline fallback
- When the USC package schema directory structure changes

**Functions:**

| Function | Purpose |
|----------|---------|
| `populateSchemaCache(uscRoot, targetDir)` | Copy schemas from USC packages into `.ai/usc-schema-cache/` |
| `hasSchemaCache(targetDir)` | Check whether the cache exists and contains `.json` files |
| `getCachedSchemaPath(targetDir, name)` | Get absolute path to a cached schema by file name |
| `listCachedSchemas(targetDir)` | List all cached schema file names |
| `readCachedSchema(targetDir, name)` | Read and parse a cached schema |
| `validateUscRepo(targetDir)` | Validate a USC repo; uses full USC validator if available, falls back to cached schemas |

**CLI commands:**

| Command | Purpose |
|---------|---------|
| `narada init usc <path>` | Initialize a USC repo and populate the schema cache |
| `narada init usc-validate <path>` | Validate a USC repo using USC packages or cached schemas as fallback |

**Version pinning:** The supported USC version range is declared in root `package.json` under `config.uscVersion`. `uscInitCommand` checks the installed `@narada.usc/compiler` version against this range and fails with a clear, actionable error if incompatible.

### 8. Add or Modify a Projection Rebuild Surface

Projection rebuild is an explicit operator family member (SEMANTICS.md §2.8). All non-authoritative derived stores must rebuild through the unified surface:

1. Define or update the projection's `ProjectionRebuildSurface` implementation
2. Register it in the scope's `ProjectionRebuildRegistry` (daemon [`service.ts`](packages/layers/daemon/src/service.ts) and CLI [`rebuild-projections.ts`](packages/layers/cli/src/commands/rebuild-projections.ts))
3. Ensure the projection's `authoritativeInput` is documented
4. Add `rebuild_*_after_sync` config option if the projection should rebuild after sync
5. Update [`src/config/types.ts`](packages/layers/control-plane/src/config/types.ts), [`src/config/load.ts`](packages/layers/control-plane/src/config/load.ts), and [`src/config/defaults.ts`](packages/layers/control-plane/src/config/defaults.ts)

**Current rebuildable projections:**

| Projection | Authoritative Input | Implementation |
|-----------|---------------------|----------------|
| Filesystem views (`by-thread/`, `by-folder/`, `unread/`, `flagged/`) | `messages/` directory (canonical message records) | [`FileViewStore`](packages/layers/control-plane/src/persistence/views.ts) |
| Search index (FTS5) | `messages/` directory (canonical message records) | [`SearchEngine`](packages/verticals/search/src/search-engine.ts) |
| Observation read models | Durable SQLite state (coordinator, outbound, intent, fact stores) | On-demand SQL queries — no stored projection to rebuild |

---

## Review Checklist for Future Architecture Changes

When proposing changes that touch public types, docs, or package surfaces, verify:

- [ ] **Kernel-first framing**: Docs and comments describe the generalized behavior first, vertical specifics second.
- [ ] **No mailbox-default types**: Generic interfaces use `scope_id` / `context_id`, not `mailbox_id` / `conversation_id`.
- [ ] **Vertical parity**: New features for one vertical have a plausible path for peers (timer, webhook, filesystem, process).
- [ ] **Authority boundaries preserved**: No new write paths bypass `ForemanFacade`, `Scheduler`, `IntentHandoff`, or `OutboundHandoff`.
- [ ] **Observation remains read-only**: No UI-facing code mutates durable state directly.
- [ ] **Control-plane lint passes**: `pnpm control-plane-lint` reports zero violations.
- [ ] **Fixture discipline defined**: Before implementing a component that crosses an integration boundary, define the fixture shape that will prove the boundary works. The fixture is part of the design, not an afterthought.

---

## Agent Verification Policy

**Do not run the full test suite unless the user explicitly asks for it.**

When verifying changes, follow this escalation ladder — never jump to the most expensive command first.

### Verification Suggestion Surface (Preferred)

Before deciding verification scope manually, ask the suggestion operator:

```bash
# For changed source files
narada verify suggest --files packages/layers/cli/src/commands/foo.ts

# Check what verification is fresh/stale
narada verify status

# Run the suggested command through policy-guarded scripts
narada verify run --cmd "pnpm --filter @narada2/cli exec vitest run test/commands/foo.test.ts"
```

The suggestion surface:
- Maps changed files to the smallest likely test file using package conventions
- Checks policy before running (same rules as `pnpm test:focused`)
- Records telemetry automatically via the existing guarded scripts
- Never runs tests automatically; suggest first, run only when asked

### Verification Ladder

| Step | Command | When to use | Approx. time |
|------|---------|-------------|--------------|
| 1 | `narada verify suggest --files ...` | Before any manual verification decision | <1 sec |
| 2 | `pnpm verify` | Default after any local change | ~15 sec |
| 3 | `pnpm --filter <pkg> typecheck` | Change is isolated to one package | 3–10 sec |
| 4 | `pnpm test:focused "<cmd>"` | Run one specific test file with telemetry | varies |
| 5 | `pnpm test:<pkg>` | Broader package tests when justified | 5–90 sec |
| 6 | `ALLOW_FULL_TESTS=1 pnpm test:full` | Final CI-like check or user explicitly asks | ~2 min |

### Rules

1. **Prefer the suggestion surface first.** Run `narada verify suggest --files ...` before inventing verification commands manually.
2. **Do not run the full suite unless the user explicitly asks.** `pnpm test` at the root is intentionally blocked.
3. **Start with `pnpm verify`.** It runs task-file guard + typecheck + build + fast package tests (charters, ops-kit). This catches most cross-cutting issues and is reliable.
4. **Prefer focused commands for package-local changes.** Use `pnpm --filter <pkg> typecheck` and `pnpm test:focused` for the specific file covering the behavior you changed. This is faster than broad suites and avoids known teardown noise.
5. **Escalate only when needed.** Run package-scoped broader tests (`pnpm test:control-plane`, `pnpm test:daemon`) only when the change justifies it.
6. **Full suite requires `ALLOW_FULL_TESTS=1`.** This guard prevents accidental expensive runs.

### Focused Test Commands

For control-plane and daemon work, broad unit-test suites are slow and can crash during teardown. Run one individual test file first:

```bash
# Example: run a single control-plane test file with telemetry
pnpm test:focused "pnpm --filter @narada2/control-plane exec vitest run test/unit/ids/event-id.test.ts"

# Example: run a specific daemon test file (preferred over broad suite)
pnpm test:focused "pnpm --dir packages/layers/daemon exec vitest run test/unit/observation-server.test.ts"

# Example: package-level focused run, only when explicitly justified
ALLOW_PACKAGE_FOCUSED=1 pnpm test:focused "pnpm --filter @narada2/charters test"

# Example: multi-file focused run, only when explicitly justified
ALLOW_MULTI_FILE_FOCUSED=1 pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/audit.test.ts test/commands/show.test.ts"

# Example: focused typecheck for one package
pnpm --filter @narada2/control-plane typecheck
```

`pnpm test:focused` records duration, exit status, and classification to `.ai/metrics/test-runtimes.json` just like the broad wrapper commands.

By default, `pnpm test:focused` rejects commands with multiple test files or package-level test commands. Use `ALLOW_MULTI_FILE_FOCUSED=1` or `ALLOW_PACKAGE_FOCUSED=1` only when the task notes justify the broader check.

### Test Runtime Observability

All test entrypoints (including `pnpm test:focused`) record timing and classification data to `.ai/metrics/test-runtimes.json`. Inspect this file to see:

- Which commands are being run and how long they take
- Per-step duration breakdowns
- Exit status and classification

This makes expensive verification choices visible for manual inspection. Automatic violation detection is not implemented; review the artifact if you suspect an agent is repeatedly choosing slower paths than necessary.

### Failure Classification

Test runs are classified into one of four categories:

| Classification | Meaning | When to act |
|----------------|---------|-------------|
| `success` | All tests passed | Nothing to do |
| `assertion-failure` | A test assertion failed | Fix the failing test or code |
| `infrastructure-failure` | Runner, build, or environment failure | Investigate tooling, not product code |
| `known-teardown-noise` | Harmless `better-sqlite3` cleanup crash **after the test suite completed with all tests passing** | No action needed — see below |

### Known `better-sqlite3` Teardown Issue

The full suite and control-plane unit tests can produce a **harmless V8 fatal error / segfault / SIGTRAP (exit code 133)** during process teardown. This occurs when:

- Many in-memory SQLite databases are created and garbage-collected
- V8 begins tearing down before better-sqlite3 native destructors finish
- The native module attempts to access JS ArrayBuffer backing stores after V8 has released them

**This is not a product regression.** All tests have already passed when the crash occurs. The runner scripts classify this as `known-teardown-noise` **only when the captured output contains evidence that the test suite completed successfully** (the Vitest `Test Files  N passed (N)` summary line). Without that evidence, the crash is conservatively classified as `infrastructure-failure` so that genuine runner problems are not silently softened into harmless noise.

**Mitigation in place:**
- **Avoid broad suites**: Prefer focused single-file tests via `pnpm test:focused` for control-plane work.
- **Classification (primary)**: Runner scripts detect exit code 133 and V8 fatal signatures. They classify as `known-teardown-noise` only when the captured output shows the Vitest all-passed summary. Otherwise the crash is reported as `infrastructure-failure`.
- **Best-effort lifecycle helper**: `packages/layers/control-plane/test/db-lifecycle.ts` provides `createTestDb()` and `closeAllTestDatabases()`. `test/setup.ts` calls `closeAllTestDatabases()` in `afterAll`. However, most unit tests still use raw `new Database(":memory:")`; broad adoption of `createTestDb()` has not happened. The helper is available for new and refactored tests.

**Root `pnpm test` is disabled** to prevent accidental full-suite execution. Use the commands above instead.

---

## Task File Policy (Hard Rule)

Files in `.ai/do-not-open/tasks/*.md` are **durable task artifacts**, not execution-log variants. The original task file is the single canonical source of truth for a task.

Reusable task contracts live in `.ai/task-contracts/`:

- `.ai/task-contracts/agent-task-execution.md` applies to task execution unless a task explicitly overrides it.
- `.ai/task-contracts/chapter-planning.md` applies to chapter-planning tasks in addition to the execution contract.
- `.ai/task-contracts/question-escalation.md` tells agents when to stop and ask the architect/user instead of making arbitrary semantic, authority, safety, private-data, or product decisions.

Task graph evolution is governed by `docs/governance/task-graph-evolution-boundary.md`. It defines task identity invariants, numeric allocation rules, range reservation, and the renumbering/correction operator. Agents must not allocate task numbers by `ls | tail`; they must use the reservation protocol or compute the next available number from task headings.

### Architectural Pruning Contract

Architecture-heavy review and pruning tasks are governed by `docs/governance/architectural-pruning.md` (PE-lite). It provides a compact procedure for distinguishing necessary complexity from concealed non-necessity using preservation context, burden ledgers, simplification witnesses, and displacement audits.

- **Required** for: architecture-heavy tasks, closure reviews touching multiple authority boundaries, and tasks whose primary goal is simplification or legacy removal.
- **Not required** for: ordinary implementation tasks, localized bug fixes, additive changes, or test/documentation-only work.
- **Subordinate**: PE-lite cannot override Narada authority boundaries, kernel invariants, or runtime semantics.

Tasks must be self-standing. An external agent should be able to execute or review a task from `execute <task-number>` or `review <task-number>` alone. If assignment requires extra pasted constraints, patch the task file first; assignment text is routing, not hidden specification.

### Governance Feedback

Agent feedback about the task-governed development system itself (ambiguous contracts, verification friction, task-DAG blocking, or suggested rule improvements) belongs in `.ai/feedback/governance.md`. This is not escalation — governance feedback is appended after the task completes, while escalation blocks the task and is recorded in the task file. See the feedback file for format and rules.

> **USC lift follow-up**: This governance-feedback pattern should later be generalized and lifted into `narada.usc` as a constructor protocol sibling to question escalation. See Task 239 for the escalation-protocol USC lift.

### Forbidden

Agents **must not** create derivative status files unless the user explicitly asks for one. Specifically forbidden suffixes:

- `-EXECUTED.md`
- `-DONE.md`
- `-RESULT.md`
- `-FINAL.md`
- `-SUPERSEDED.md`

### Required

- Task completion evidence belongs **in the original task file**, in a bounded section such as `## Execution Notes`, `## Verification`, or `## Outcome`.
- If a task is obsolete or superseded, mark that status **in the original task file** rather than creating a sibling status file.
- Do not leave stale or contradictory task state scattered across multiple files.

### Enforcement

The guard script `scripts/task-file-guard.ts` runs as part of `pnpm verify`. It fails the build if any forbidden derivative filename is present in `.ai/do-not-open/tasks/`.

---

## Package-Specific Guidance

For detailed conventions, coding standards, and package-specific patterns, see [`packages/layers/control-plane/AGENTS.md`](packages/layers/control-plane/AGENTS.md).
