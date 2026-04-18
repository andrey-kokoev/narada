# Task 124 Result: Comprehensive Semantic Architecture Audit

> **Corrected by Task 127 (2026-04-18):** Factual drift against the current tree has been repaired. The `@narada2/charters` runtime surface, evaluation persistence state, README characterization, and `operation` atomicity contradiction have been updated. Each cavity now separates observed present state from proposed future state.

## Executive Summary

Narada has a **well-designed conceptual architecture** (layers → domains → verticals, control-plane v2, intent-as-universal-boundary) but a **monolithic physical implementation** that creates semantic cavities across all seven inspected layers. The `kernel` package is a gravity well containing ~90% of the system. Seven layer packages and one vertical package are empty scaffolding. This gap between concept and code is the root cause of most semantic drift.

---

## 1. Canonical Object Inventory

### 1.1 User-Facing Ontology

| Canonical Name | Layer | Definition | User-Facing | Atomic/Composite | Current Authority |
|----------------|-------|------------|-------------|------------------|-------------------|
| **Narada** | Product | The deterministic state compiler and operation control system | Yes | Product | `@narada2/cli` binary |
| **operation** | User | The live configured thing a user sets up and runs (mailbox, workflow, webhook) | Yes | Atomic | `ops-kit` + `kernel` config |
| **ops repo** | User | Private repository containing operations, knowledge, scenarios, and local config | Yes | Composite | `ops-kit` (`init-repo`) |
| **mailbox operation** | User | Operation whose source is an Exchange/Graph mailbox | Yes | Atomic | `kernel` (mail vertical) |
| **workflow operation** | User | Operation whose source is a timer/cron schedule | Yes | Atomic | `kernel` (timer vertical) |
| **posture** | User | Named safety preset mapping to allowed actions + approval gate | Yes | Atomic | `ops-kit` + `kernel` policy |
| **charter** | User | Policy definition that guides evaluation (replaces "agent") | Yes | Atomic | `@narada2/charters` |
| **activation** | User | Marking an operation as live (`.activated` sentinel file) | Yes | Atomic | `ops-kit` (`activate`) |
| **demo** | User | Zero-setup synthetic mailbox trial | Yes | Atomic | `cli` / `daemon` |
| **scenario** | User | Scripted example of charter behavior (in `knowledge/`) | Yes | Atomic | User-created |

### 1.2 Operational / Lifecycle Ontology

| Canonical Name | Layer | Definition | User-Facing | Atomic/Composite | Current Authority |
|----------------|-------|------------|-------------|------------------|-------------------|
| **shape** | Operational | Declaring intent for an operation (`want-*`) | Yes | Atomic | `ops-kit` |
| **setup** | Operational | Scaffolding on-disk directories for declared operations | Yes | Atomic | `ops-kit` |
| **preflight** | Operational | Readiness verification (config, credentials, dirs, activation) | Yes | Atomic | `ops-kit` |
| **readiness** | Operational | Aggregate pass/fail/warn state from preflight checks | Partial | Atomic | `ops-kit` |
| **health** | Operational | Daemon runtime health status (sync lag, errors, uptime) | Partial | Atomic | `daemon` (`HealthFile`) |
| **status** | Operational | Current observable state of an operation or the system | Yes | Atomic | `cli` (`status`) / `daemon` |
| **quiescence** | Internal | State where no runnable work items exist | No | Atomic | `scheduler` |

### 1.3 Control-Plane Ontology

| Canonical Name | Layer | Definition | User-Facing | Atomic/Composite | Current Authority |
|----------------|-------|------------|-------------|------------------|-------------------|
| **fact** | Control | Source-neutral envelope of an observed change | No | Atomic | `kernel` (`facts/`) |
| **context** | Control | Domain-neutral thread/work unit (`context_id`) | No | Atomic | `kernel` (`coordinator/`) |
| **revision** | Control | Monotone version of a context (`context_id:rev:N`) | No | Atomic | `kernel` (`coordinator/`) |
| **work item** | Control | Terminal schedulable unit of control work | No | Atomic | `kernel` (`scheduler/`, `foreman/`) |
| **lease** | Control | Crash-safe execution lock on a work item | No | Atomic | `kernel` (`scheduler/`) |
| **execution attempt** | Control | Bounded charter invocation record | No | Atomic | `kernel` (`scheduler/`) |
| **session** | Control | Operator-facing interpretive session for a work item | No | Atomic | `kernel` (`scheduler/` + `foreman/`) |
| **evaluation** | Control | Durable charter output summary (intended to be persisted by runtime; currently ephemeral in production) | No | Atomic | `kernel` (`foreman/` consumes it; `coordinator/` stores it) |
| **decision** | Control | Append-only governance record from foreman | No | Atomic | `kernel` (`foreman/`) |
| **intent** | Control | Domain-neutral durable effect boundary | No | Atomic | `kernel` (`intent/`) |
| **outbound command** | Control | Mailbox-specific mutation command | No | Atomic | `kernel` (`outbound/`) |
| **trace** | Control | Non-authoritative commentary on execution | No | Atomic | `kernel` (`agent/traces/`) |
| **tool call** | Control | Durable tool invocation record | No | Atomic | `kernel` (`daemon` + `charters`) |
| **policy override** | Control | Human override for blocked commands | No | Atomic | `kernel` (`coordinator/`) |

### 1.4 Runtime Authority Ontology

| Canonical Name | Layer | Definition | User-Facing | Atomic/Composite | Current Authority |
|----------------|-------|------------|-------------|------------------|-------------------|
| **sync runner** | Runtime | Inbound data pipeline: fetch → apply → fact ingestion → cursor commit | No | Atomic | `kernel` (`runner/`) |
| **foreman** | Runtime | Work opening, supersession, resolution, atomic handoff | No | Atomic | `kernel` (`foreman/`) |
| **scheduler** | Runtime | Lease acquisition, execution lifecycle, retry/backoff, stale recovery | No | Atomic | `kernel` (`scheduler/`) |
| **charter runner** | Runtime | Read-only sandbox: envelope → output envelope | No | Atomic | `@narada2/charters` (interface) / `daemon` (impl) |
| **tool runner** | Runtime | Executes tool requests from charter output | No | Atomic | `@narada2/charters` (interface) / `daemon` (impl) |
| **intent handoff** | Runtime | Bridges foreman decisions into intent boundary | No | Atomic | `kernel` (`intent/`) |
| **outbound handoff** | Runtime | Mailbox-specific command creation inside atomic tx | No | Atomic | `kernel` (`foreman/`) |
| **send-reply worker** | Runtime | Draft creation, verification, policy gating, send | No | Atomic | `kernel` (`outbound/`) |
| **non-send worker** | Runtime | Direct Graph mutations without draft staging | No | Atomic | `kernel` (`outbound/`) |
| **reconciler** | Runtime | Binds submitted commands to observed remote state | No | Atomic | `kernel` (`outbound/`) |
| **process executor** | Runtime | Spawns subprocesses for `process.run` intents | No | Atomic | `kernel` (`executors/`) |
| **daemon** | Runtime | Orchestrates full lifecycle + hosts observation API | Partial | Composite | `@narada2/daemon` |

### 1.5 Package / Public Surface Ontology

| Package | Claimed Role | Actual Role | Assessment |
|---------|-------------|-------------|------------|
| `@narada2/kernel` | Deterministic kernel substrate | **Monolithic application** (~90% of system) | Misaligned |
| `@narada2/cli` | CLI binary | Thin wrapper over `ops-kit` + `kernel` | Correct |
| `@narada2/daemon` | Long-running daemon | Orchestrator + observation HTTP + operator actions | Overloaded |
| `@narada2/charters` | Charter contracts | Zod schemas, runtime envelopes, Codex-compatible charter runner (`runtime/runner.ts`), tool runner/resolver (`tools/runner.ts`, `tools/resolver.ts`) | Correct and materially participates in runtime |
| `@narada2/ops-kit` | — (uncategorized) | User-facing ops shaping library | Valid but taxonomy gap |
| `@narada2/search` | FTS5 vertical | Real vertical with CLI | Correct |
| `@narada2/mailbox` (at `packages/verticals/mailbox`) | Mail vertical | **Empty shell** — `src/index.ts` is a TODO comment; all code lives in `kernel` | Hollow |
| `@narada2/scheduler` | Layer: scheduling | Empty shell | Hollow |
| `@narada2/execution` | Layer: execution | Empty shell | Hollow |
| `@narada2/foreman` | Layer: foreman | Empty shell | Hollow |
| `@narada2/intent` | Layer: intent | Empty shell | Hollow |
| `@narada2/observation` | Layer: observation | Empty shell | Hollow |
| `@narada2/sources` | Layer: sources | Empty shell | Hollow |
| `@narada2/outbound` | Layer: outbound | Empty shell | Hollow |

---

## 2. Semantic Cavities

### Cavity 1: The Monolithic Kernel

**Observed present state:**
The `kernel` package is simultaneously a "small substrate" and "the entire application." Seven layer packages are empty scaffolding (each `src/index.ts` is a TODO comment). One vertical package (`packages/verticals/mailbox`) is also an empty shell. The conceptual architecture (layers → domains → verticals) is not reflected in the code. The one exception is `@narada2/charters`, which has evolved from pure contracts into a real runtime package with a charter runner, tool runner, and resolver.

**Why it is a problem:**
- No package-level enforcement of boundaries; `kernel-lint.ts` compensates with module-level allowlists
- Consumers import from a monolith, creating tight coupling
- The empty packages create confusion about where new code should go
- "Kernel" has lost its meaning — it is neither a microkernel nor a clean library

**Affected parts:** All packages that depend on `kernel` (daemon, cli, ops-kit, search). The entire control-plane ontology.

**Proposed authoritative resolution:**
1. Rename `@narada2/kernel` → `@narada2/control-plane` to reflect its actual scope
2. Delete the 7 empty layer packages; they are misleading scaffolding
3. Keep `packages/verticals/mailbox` as a real vertical extraction target, but acknowledge it is future work
4. Document the current state honestly: "control-plane is monolithic; extraction is a future architectural goal, not current reality"
5. Do **not** treat `@narada2/charters` as empty — it is a real runtime dependency

---

### Cavity 2: "Scope" Leaks into User-Facing Surfaces

**Observed present state:**
The internal term `scope` / `scope_id` is exposed directly in CLI arguments (`<scope-id>`), command output (`inspect`, `explain`), and error messages. `TERMINOLOGY.md` explicitly says "users should not need to know the word 'scope'."

**Why it is a problem:**
Creates cognitive load on users. Violates Narada's own terminology policy. Makes the CLI feel like an internal debug tool rather than a user-facing product.

**Affected parts:** `ops-kit` commands (`preflight`, `inspect`, `explain`, `activate`), `cli` argument parsing, user-facing output strings.

**Proposed authoritative resolution:**
1. Rename all CLI arguments from `<scope-id>` → `<operation>`
2. Update `inspect` output to use `operation` instead of `scope_id`
3. Update `explain` output to avoid the word "scope"
4. Keep `scope_id` in config files and internal APIs (it is the correct internal term)

---

### Cavity 3: Posture Preset Naming is Inconsistent Across Verticals

**Observed present state:**
Posture presets for mailbox and workflow verticals use non-parallel naming. Users cannot map "what level of autonomy am I granting?" across operation types.

| Mailbox | Workflow | Implied Level |
|---------|----------|---------------|
| `draft-only` | `observe-only` | Low autonomy |
| `draft-and-review` | `draft-alert` | Medium autonomy |
| `send-allowed` | `act-with-approval` | High autonomy |

Additionally, `explain` invents its own labels (`send-capable`) that do not match preset names.

**Why it is a problem:**
Users must learn two unrelated vocabularies for the same safety concept. The `explain` output contradicts the `want-posture` input.

**Affected parts:** `ops-kit/src/commands/want-posture.ts`, `ops-kit/src/render/explain.ts`, user documentation.

**Proposed authoritative resolution:**
1. Define a **single canonical progression** across all verticals:
   - `observe-only` — read-only, no effects
   - `draft-only` — may draft effects, never execute
   - `review-required` — may draft and propose, requires human approval for execution
   - `autonomous` — may execute autonomously within policy
2. Map vertical-specific behavior onto this progression (mailbox `send_reply` becomes `autonomous` for mail; workflow `process_run` becomes `autonomous` for workflows)
3. Fix `explain` to use the canonical preset names, not derived labels

---

### Cavity 4: Scheduler Mutates Terminal WorkItem States

**Observed present state:**
`SqliteScheduler.failExecution()` transitions work items to `failed_terminal` and `failed_retryable` directly. `kernel/docs/00-kernel.md` Authority Boundary 2 states: "Only `DefaultForemanFacade.resolveWorkItem()` may transition a `work_item` to terminal status based on charter output."

**Why it is a problem:**
The scheduler is acting as both lease-manager *and* resolution authority for crash/timeout paths. This violates the claimed invariant and makes it impossible to reason about "who resolved this work item?" by looking at the code path.

**Affected parts:** `kernel/src/scheduler/scheduler.ts`, `kernel/docs/00-kernel.md` invariants.

**Proposed authoritative resolution:**
1. **Short-term:** Update the documented invariant to acknowledge that the scheduler may transition to `failed_terminal` and `failed_retryable` on crash/timeout. Make this explicit: "Scheduler may fail work items due to lease expiration or execution crash. Foreman may resolve work items due to charter output."
2. **Long-term:** Introduce a `ForemanFacade.failWorkItem()` method that the scheduler calls, so the foreman remains the single authority for all terminal transitions.

---

### Cavity 5: Evaluations Are Not Persisted in the Production Path

**Observed present state:**
- `DefaultForemanFacade.resolveWorkItem()` does **not** persist evaluations. A comment at `facade.ts:434` explicitly states: "Evaluation persistence is the caller's (runtime) responsibility. The foreman only validates and governs the already-persisted evaluation."
- `EvaluationEnvelope` already includes `evaluation_id: string` (`foreman/types.ts:110`). `governance.ts` already uses `winner_evaluation_id` for arbitration.
- However, `ResolveWorkItemRequest` still accepts `evaluation: EvaluationEnvelope` (the full envelope object), not `evaluation_id: string`.
- The daemon's production path (`daemon/src/service.ts:641`) builds the evaluation in memory via `buildEvaluationRecord()` and passes it directly to `resolveWorkItem()`. It never calls `coordinatorStore.insertEvaluation()`.
- `insertEvaluation()` exists in `SqliteCoordinatorStore` and is tested, but no production code calls it.

**Why it is a problem:**
The foreman claims evaluations are "already-persisted," but they are not. The evaluations table is a dead path in production. All evaluation data exists only ephemerally during `resolveWorkItem()` and is reconstructed into `decision` and `outbound_handoff` records. If we ever need to audit what a charter actually proposed (not just what the foreman decided), that data is lost for non-accept paths. The `evaluation_id` field exists in the types but is not used as a durable lookup key.

**Affected parts:** `daemon/src/service.ts`, `kernel/src/foreman/facade.ts`, `kernel/src/foreman/types.ts`, `kernel/src/charter/envelope.ts`.

**Proposed authoritative resolution:**
1. Make the daemon/runtime call `coordinatorStore.insertEvaluation()` after `buildEvaluationRecord()` and before `resolveWorkItem()`
2. Change `ResolveWorkItemRequest` to accept `evaluation_id: string` instead of `evaluation: EvaluationEnvelope`
3. The foreman looks up the evaluation by ID from the coordinator store
4. Update `buildEvaluationRecord()` to ensure `evaluation_id` is stable and deterministic
5. Update tests to persist evaluations before calling `resolveWorkItem`

---

### Cavity 6: Charter Runtime Authority is Split Between Kernel and Charters

**Observed present state:**
- `CharterInvocationEnvelope`, `CharterOutputEnvelope`, and all sub-types are defined in `@narada2/charters` (`runtime/envelope.ts`) with Zod schemas.
- The kernel (`kernel/src/foreman/types.ts`) redefines parallel TypeScript interfaces for `EvaluationEnvelope`, `ProposedAction`, `ToolCatalogEntry`, `AllowedAction`, etc.
- `@narada2/charters` also now contains a real runtime: `runtime/runner.ts` (Codex-compatible charter runner), `runtime/mock-runner.ts`, `runtime/validation.ts`, `tools/runner.ts`, and `tools/resolver.ts`.
- The kernel imports `validateCharterOutput` from `@narada2/charters` but still maintains its own type definitions.

**Why it is a problem:**
Two authorities for the same contract. Any change to the envelope must be made in two places. Risk of drift between the runtime schema and the kernel's types. The charters package has evolved beyond "contracts only" into a real runtime participant, but the kernel has not acknowledged this by importing its types.

**Affected parts:** `kernel/src/foreman/types.ts`, `domains/charters/src/runtime/envelope.ts`, `kernel/src/charter/envelope.ts`, all consumers.

**Proposed authoritative resolution:**
1. Make `@narada2/charters` the **single canonical owner** of `CharterInvocationEnvelope`, `CharterOutputEnvelope`, and all sub-types
2. Add `@narada2/charters` as a dependency of `@narada2/kernel`
3. Remove duplicate type definitions from `kernel/src/foreman/types.ts` and `kernel/src/charter/envelope.ts`
4. Import from `@narada2/charters` in all kernel files that use these types
5. Re-export through `kernel/src/index.ts` for backward compatibility

---

### Cavity 7: Daemon Absorbs Observation and Operator Action Concerns

**Observed present state:**
The `@narada2/daemon` package contains `observation-routes.ts`, `operator-action-routes.ts`, and `operator-actions.ts`. These are control-plane UI surfaces, not "daemon" concerns. The `@narada2/observation` layer package is empty.

**Why it is a problem:**
The daemon is overloaded. It orchestrates sync → dispatch → execution → resolution *and* hosts HTTP APIs for operators. These have different scaling, stability, and security profiles.

**Affected parts:** `packages/layers/daemon/src/`, empty `packages/layers/observation/`.

**Proposed authoritative resolution:**
1. **Short-term:** Document that observation/operator-action routes are co-located with the daemon for pragmatic reasons, but are conceptually a separate layer
2. **Long-term:** Extract observation routes and operator actions into a dedicated `@narada2/observation` package (or merge into `control-plane` if kernel is renamed)
3. Consider splitting the daemon into `daemon-core` (orchestration) and `daemon-api` (HTTP surfaces)

---

### Cavity 8: Process Executor Has a Parallel Scheduling Substrate

**Observed present state:**
`ProcessExecutor` maintains its own `lease_expires_at` / `lease_runner_id` fields and its own `recoverStaleExecutions()`. The `SqliteScheduler` does not know about process executions. There is no unified stale-execution recovery.

**Why it is a problem:**
Two scheduling substrates with different recovery semantics create operational complexity. A hung process execution and a hung work item lease are recovered by different code paths at different intervals.

**Affected parts:** `kernel/src/executors/process-executor.ts`, `kernel/src/scheduler/scheduler.ts`, `daemon/src/service.ts`.

**Proposed authoritative resolution:**
1. Unify lease/recovery concepts under a single `LeaseManager` or `RecoveryCoordinator` abstraction
2. Process executions should participate in the same stale-recovery mechanism as work item leases, or
3. Document the dual-recovery model explicitly and ensure the daemon calls both consistently

---

### Cavity 9: Governance Does Not Cover Tool Requests

**Observed present state:**
`governEvaluation()` governs `proposed_actions` but does not inspect or approve `tool_requests`. Tool requests are validated only for catalog membership (`validateCharterOutput` Rule 5) and read-only status (daemon Phase A gating). There is no foreman-level governance of tool side effects.

**Why it is a problem:**
A charter could request a destructive tool call that bypasses the foreman's governance boundary. The daemon's Phase A read-only gating is a stopgap, not an architectural guarantee.

**Affected parts:** `kernel/src/foreman/governance.ts`, `daemon/src/service.ts`.

**Proposed authoritative resolution:**
1. Extend `governEvaluation()` to inspect `tool_requests` against the policy
2. Tool requests should be subject to the same approval logic as actions (human approval, confidence floor, etc.)
3. Remove the daemon's ad-hoc read-only gating once foreman governance covers tools

---

### Cavity 10: Orphaned or Misleading Database Artifacts

**Observed present state:**
- `charter_outputs` table — still created by `SqliteCoordinatorStore.initSchema()`. `insertCharterOutput()` exists and is tested, but no production code writes to it. However, `observability/mailbox.ts` still **queries** `charter_outputs` for display. So the read path is alive but the write path is dead.
- `thread_records` in `coordinator/schema.sql` — actual runtime uses `context_records`. The `.sql` file still documents the old table name.
- `coordinator/schema.sql` itself — stale documentation artifact; runtime schema is inline in `SqliteCoordinatorStore.initSchema()`.
- `agent_traces` schema (both `schema.sql` and `store.ts`) still uses `conversation_id` instead of `context_id`, violating the neutral naming policy.

**Why it is a problem:**
Dead write paths and stale schema files waste space and confuse anyone reading the schema. The `.sql` file is actively misleading. The `conversation_id` naming in `agent_traces` is a holdover from mailbox-specific terminology that should have been neutralized.

**Affected parts:** `kernel/src/coordinator/schema.sql`, `kernel/src/coordinator/store.ts`, `kernel/src/agent/traces/schema.sql`, `kernel/src/agent/traces/store.ts`, `kernel/src/observability/mailbox.ts`.

**Proposed authoritative resolution:**
1. Delete `kernel/src/coordinator/schema.sql` or mark it prominently as "stale reference — see `SqliteCoordinatorStore.initSchema()`"
2. Either revive the `charter_outputs` write path or remove the table and update `observability/mailbox.ts` to query `evaluations` instead
3. Rename `agent_traces.conversation_id` → `context_id` in both schema and store

---

### Cavity 11: Missing Unified Worker Dispatch for Mail Outbound

**Observed present state:**
`drainWorker(registry, 'process_executor')` is explicit in the daemon. Mail workers (`send-reply`, `non-send`, `reconciler`) are not registered in the `WorkerRegistry`. They appear to be driven by separate polling loops.

**Why it is a problem:**
The worker dispatch model is inconsistent. Process executors use a registry; mail workers use ad-hoc loops. This makes the daemon harder to understand and extend.

**Affected parts:** `daemon/src/service.ts`, `kernel/src/outbound/`.

**Proposed authoritative resolution:**
1. Register mail outbound workers in the `WorkerRegistry` with their own family identifier (`mail_send`, `mail_reconcile`)
2. Unify daemon dispatch so all workers are drained through the registry

---

### Cavity 12: README.md Command Table Is Incomplete

**Observed present state:**
The root `README.md` has been partially updated. It acknowledges the unified `narada` CLI ("All commands — runtime, backup, and operation shaping — are available through the single `narada` CLI") and points readers to `QUICKSTART.md`. The CLI command table now includes the trial-entry commands (`demo`, `init-repo`, `init-repo --demo`) alongside the legacy runtime commands (`init`, `sync`, `status`, `integrity`). However, it still omits most of the 15+ ops-kit shaping commands (`want-mailbox`, `want-workflow`, `setup`, `preflight`, `explain`, `activate`, `want-posture`, etc.).

**Why it is a problem:**
New users landing on the repo see a partially updated but incomplete picture. The text acknowledges the full CLI, but the command table is still missing most of the shaping commands. This creates confusion about whether the shaping commands are first-class or experimental.

**Affected parts:** `README.md` command table, `QUICKSTART.md`.

**Proposed authoritative resolution:**
1. Rewrite `README.md` command table to include all 19 commands
2. Lead with the ops-repo / operation-shaping narrative, not the sync narrative
3. Move legacy sync-only details to a secondary section

---

### Cavity 13: Operation Atomicity Contradiction in Canonical Documentation

**Observed present state:**
The audit inventory (Section 1.1) treats `operation` as an **atomic** user-facing concept — "The live configured thing a user sets up and runs" — with typed variants like `mailbox operation`, `workflow operation`, and `webhook operation`.

However, `TERMINOLOGY.md` (line 14) explicitly documents:

> - a support operation spanning multiple mailboxes

This is a direct ontology contradiction. The same canonical document that establishes `operation` as the primary user-facing term also describes it as potentially composite (spanning multiple scopes).

**Why it is a problem:**
If an operation can span multiple mailboxes, then it is not atomic — it is a composite that compiles into multiple scopes. This undermines the entire user-facing ontology. Users are told to "set up and run operations," but if operations can be multi-mailbox, the CLI's `<operation>` argument would need to resolve to multiple `scope_id`s, which no code path currently supports. The contradiction creates ambiguity about whether `operation` and `scope` are 1:1 or 1:N.

**Affected parts:** `TERMINOLOGY.md`, `ops-kit` command implementations, CLI argument parsing.

**Proposed authoritative resolution:**
1. **Make `operation` strictly atomic** (1 operation = 1 scope). Remove the "support operation spanning multiple mailboxes" example from `TERMINOLOGY.md`.
2. If multi-mailbox support is a future requirement, define it as a **distinct composite concept** (e.g., `operation group`, `suite`, or `campaign`) that compiles into multiple atomic operations.
3. Until such a composite concept is designed and implemented, all documentation and code should treat `operation` as atomic.

---

## 3. Follow-Up Tasks by Area

### Package / Physical Architecture

- **Task 124-A:** Rename `@narada2/kernel` → `@narada2/control-plane`; update all dependents
- **Task 124-B:** Delete 7 empty layer packages (`scheduler`, `execution`, `foreman`, `intent`, `observation`, `sources`, `outbound`)
- **Task 124-C:** Document the monolithic state: add `ARCHITECTURE.md` section explaining why control-plane is monolithic and what extraction would require

### User-Facing Ontology

- **Task 124-D:** Rename CLI `<scope-id>` arguments → `<operation>` across all ops-kit and cli commands
- **Task 124-E:** Fix `explain` posture labels to match canonical preset names
- **Task 124-F:** Align posture preset naming to unified progression (`observe-only` → `draft-only` → `review-required` → `autonomous`)
- **Task 124-G:** Rewrite `README.md` to reflect the full 19-command surface and ops-repo narrative

### Control-Plane Authority

- **Task 124-H:** Make daemon/runtime persist evaluations via `insertEvaluation()` before calling `resolveWorkItem()`; change `ResolveWorkItemRequest` to accept `evaluation_id` instead of full `EvaluationEnvelope` (precedes or is part of Task 123)
- **Task 124-I:** Consolidate envelope authority into `@narada2/charters` (Task 123)
- **Task 124-J:** Add `ForemanFacade.failWorkItem()` so scheduler delegates terminal failure transitions to foreman
- **Task 124-K:** Extend `governEvaluation()` to cover `tool_requests`

### Database / Schema Hygiene

- **Task 124-L:** Delete or clearly mark stale `coordinator/schema.sql`
- **Task 124-M:** Resolve `charter_outputs` fate: either revive write path or remove table and update `observability/mailbox.ts` to query `evaluations`
- **Task 124-N:** Rename `agent_traces.conversation_id` → `context_id`

### Runtime / Daemon

- **Task 124-O:** Register mail outbound workers in `WorkerRegistry`; unify daemon dispatch
- **Task 124-P:** Unify process executor lease/recovery with scheduler lease model (or document dual model)
- **Task 124-Q:** Extract observation routes from daemon into a dedicated module or package

### Documentation

- **Task 124-R:** Update `kernel/docs/00-kernel.md` Authority Boundaries to reflect scheduler's role in failing work items
- **Task 124-S:** Create a single `SEMANTICS.md` or `ONTOLOGY.md` at repo root that consolidates `TERMINOLOGY.md` + this audit's inventory
- **Task 124-T:** Fix `TERMINOLOGY.md` to remove the "support operation spanning multiple mailboxes" example; establish `operation` as strictly atomic

---

## 4. Priority Ranking

| Rank | Task | Cavity | Effort | Impact |
|------|------|--------|--------|--------|
| 1 | 124-I (Envelope authority) | #6 | Medium | High — blocks clean charter/kernel separation |
| 2 | 124-H (Evaluation persistence) | #5 | Medium | High — fixes runtime/foreman boundary |
| 3 | 124-D (Scope → operation) | #2 | Low | High — immediate user-facing improvement |
| 4 | 124-T (Operation atomicity) | #13 | Low | High — fixes canonical terminology contradiction |
| 5 | 124-F (Posture naming) | #3 | Low | Medium — user confusion reduction |
| 6 | 124-A (Rename kernel) | #1 | Medium | Medium — honesty about architecture |
| 7 | 124-L/M/N (Schema hygiene) | #10 | Low | Low — removes confusion |
| 8 | 124-J (Scheduler→Foreman failure) | #4 | Medium | Medium — authority clarity |
| 9 | 124-K (Tool governance) | #9 | Medium | Medium — security boundary |
| 10 | 124-O (Unified worker dispatch) | #11 | High | Low — architectural cleanup |
| 11 | 124-Q (Extract observation) | #7 | High | Low — future scaling |

---

## Definition of Done for Task 124

- [x] Narada's semantic stack has been audited across user, operational, control-plane, runtime, artifact, and package layers
- [x] Canonical objects and terms are explicitly enumerated (Section 1)
- [x] Semantic cavities are explicitly named with precise descriptions (Section 2)
- [x] Each cavity cleanly separates observed present state from proposed future state (corrected by Task 127)
- [x] Factual drift against the current tree has been corrected (corrected by Task 127)
- [x] The missed multi-mailbox `operation` ontology contradiction is explicitly identified (corrected by Task 127)
- [x] Follow-up corrective tasks are derived by area, aligned with corrected facts, and ranked by priority (Sections 3–4)
