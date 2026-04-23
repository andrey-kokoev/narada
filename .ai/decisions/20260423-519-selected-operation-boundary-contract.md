# Decision: Selected Operation Boundary Contract

**Date:** 2026-04-23
**Task:** 519
**Depends on:** 518 (Second Operation Selection Contract)
**Chapter:** Second Traveling Operation Selection and Proof (518–521)
**Verdict:** **Boundary contract defined. All seven pipeline stages are explicit. No new kernel components required.**

---

## 1. Operation Under Contract

**Name:** Scheduled Site Health Check and Maintenance Reporting  
**Family:** Timer → Process  
**Scope ID:** `health-check-maintenance`  
**Charter:** `maintenance_steward`  
**Context Strategy:** `timer`

### Operation Shape

```json
{
  "scope_id": "health-check-maintenance",
  "root_dir": "./data/health-check-maintenance",
  "sources": [
    {
      "type": "timer",
      "source_id": "timer:hourly-health",
      "schedule_id": "hourly_health_check",
      "interval_ms": 3600000
    }
  ],
  "context_strategy": "timer",
  "charter": { "runtime": "codex-api" },
  "policy": {
    "primary_charter": "maintenance_steward",
    "allowed_actions": ["process_run", "no_action"],
    "require_human_approval": true
  }
}
```

---

## 2. Boundary Definitions

### 2.1 Fact Boundary

**Fact type:** `timer.tick`

**Source → Fact compiler:** `sourceRecordToFact()` in `src/facts/record-to-fact.ts`

**Deterministic identity:** A `timer.tick` fact is identified by:
- `fact_type`: `"timer.tick"`
- `source_id`: the `TimerSource.sourceId`
- `source_record_id`: `"{schedule_id}:{slot_start_iso}"`
- `source_cursor`: the slot start ISO string

**Slot identity invariant:**
```
slot_start_ms = floor(now / intervalMs) * intervalMs
recordId = "{schedule_id}:{slot_start_iso}"
```

The same slot always produces the same `recordId`, making duplicate emission safe under the apply-log.

**Payload shape (inside `payload_json.event`):**
```typescript
interface TimerTickPayload {
  kind: "timer.tick";
  slot_id: string;       // "{schedule_id}:{slot_start_iso}"
  schedule_id: string;   // e.g., "hourly_health_check"
  slot_start: string;    // ISO 8601
  slot_end: string;      // ISO 8601
}
```

**Fact store interface:** `FactStore.ingest()` — idempotent insert. `FactStore.markAdmitted()` — transitions to control plane.

**What is durable:** The fact envelope (`fact_id`, `fact_type`, `provenance`, `payload_json`).

**What is NOT durable:** The timer's internal clock state. The checkpoint (last emitted slot) is recomputed from `now` on each pull.

**Authority:** Facts are append-only. No component may edit a fact after ingestion.

---

### 2.2 Work Boundary

**Context formation:** `TimerContextStrategy.formContexts()` in `src/foreman/context.ts`

**Context ID:** `timer:{schedule_id}`  
Example: `timer:hourly_health_check`

**Grouping rule:** All `timer.tick` facts with the same `schedule_id` are grouped into one context.

**Revision ordinal:** Monotonically incremented per context. Format: `{context_id}:rev:{ordinal}`.

**Work item opening:** Only `DefaultForemanFacade.onFactsAdmitted()` (or `onSyncCompleted()`) may open work items. Both delegate to the private `onContextsAdmitted()` path.

**Work item lifecycle:**
```
opened → leased → executing → resolved | failed_retryable | failed_terminal
```

**Lease uniqueness:** At most one unreleased, unexpired lease per work item (enforced by `SqliteScheduler`).

**Authority:** Only the foreman may open work items. Only the scheduler may create/release leases and transition to `leased` or `executing`.

---

### 2.3 Evaluation Boundary

**Charter invocation envelope:** Built by `buildInvocationEnvelope()` in `src/charter/envelope.ts`

**Context materialization:** `TimerContextMaterializer.materialize()` in `src/charter/envelope.ts`

**Materialized context shape:**
```typescript
interface TimerContextMaterialization {
  schedule_id: string;
  tick_at: string;        // ISO 8601 — when the context was formed
  metadata: unknown;      // opaque schedule metadata (v0: empty)
  facts: Fact[];          // the timer.tick facts that contributed
}
```

**Evaluation record:** `EvaluationEnvelope` with:
- `outcome`: `"complete" | "no_op" | "escalation" | "clarification_needed"`
- `proposed_actions`: Array of `ProposedAction`
- `confidence`: `{ overall: "low" | "medium" | "high", uncertainty_flags: string[] }`

**Allowed actions for this operation:** `["process_run", "no_action"]`

**Authority:** The charter runtime is a read-only sandbox. It consumes the invocation envelope and produces an output envelope. It must NOT write to coordinator, outbound, or intent stores directly.

---

### 2.4 Decision Boundary

**Foreman resolution:** `DefaultForemanFacade.resolveWorkItem()` in `src/foreman/facade.ts`

**Governance layer:** `governEvaluation()` + `governAction()` in `src/foreman/governance.ts`

**For `process_run` actions, governance checks:**
1. Action type is in `policy.allowed_actions`
2. Payload is valid JSON
3. Payload contains a non-empty `command` string
4. Confidence is sufficient (`low` confidence → escalation)
5. `require_human_approval` policy flag (if true → requires approval)

**Decision record:** `foreman_decision` row with:
- `approved_action`: `"process_run"` or `"no_action"`
- `outbound_id`: the intent idempotency key
- `status`: `"pending_approval"` (if approval required) or `"approved"`

**Authority:** Only `DefaultForemanFacade.resolveWorkItem()` may transition a work item to `resolved` based on charter output and policy governance.

---

### 2.5 Intent Boundary

**Intent type:** `process.run`

**Intent family registry:** `INTENT_FAMILIES["process.run"]` in `src/intent/registry.ts`

**Payload schema:**
```typescript
interface ProcessRunPayload {
  command: string;           // required
  args?: string[];           // optional
  cwd?: string;              // optional
  env?: Record<string, string>; // optional
  timeout_ms?: number;       // optional (default: 300_000)
}
```

**Idempotency scope:** `context_action` — one `process_run` per context per action.

**Confirmation model:** `none` — process execution confirms immediately via exit code (see §2.7).

**Intent creation:** Only `IntentHandoff.admitIntentFromDecision()` may create intent rows. Called from within the foreman's atomic decision transaction.

**Intent lifecycle:**
```
admitted → executing → completed | failed_terminal
```

**Authority:** Only `IntentHandoff` may create intents. Only `ProcessExecutor` may transition intents to `executing`. Only the executor may transition to `completed` or `failed_terminal`.

---

### 2.6 Execution Boundary

**Executor family:** `process`

**Executor:** `ProcessExecutor` in `src/executors/process-executor.ts`

**Execution record:** `ProcessExecution` in `src/executors/types.ts`

**What happens:**
1. `ProcessExecutor.processNext()` finds the next eligible `process.run` intent
2. Creates a `ProcessExecution` row with `phase: "pending"`
3. Spawns the subprocess via `node:child_process.spawn()`
4. Captures stdout/stderr (truncated to 64 KB each)
5. On close: updates execution record with exit code, output, timestamps
6. Updates intent status: `completed` (exit 0) or `failed_terminal` (exit ≠ 0 or spawn error)

**Lease model:** `ProcessExecutionStore` maintains `lease_expires_at` / `lease_runner_id` on `process_executions`. Distinct from scheduler's `work_item_leases`.

**Recovery:** `ProcessExecutor.recoverStaleExecutions()` marks stale running executions as failed and resets their intents to `admitted`.

**Authority:** Only `ProcessExecutor` may spawn subprocesses. No other component may call `spawn()` for governed process execution.

---

### 2.7 Confirmation Boundary

**Confirmation resolver:** `ProcessConfirmationResolver` in `src/executors/confirmation.ts`

**Confirmation semantics:**
- Process execution treats exit code as immediate confirmation
- `exit_code === 0` → `confirmation_status: "confirmed"`
- `exit_code !== 0` or spawn error → `confirmation_status: "confirmation_failed"`

**Confirmation record:** Written to `process_executions.confirmation_status` and `process_executions.confirmed_at`.

**Idempotency:** Repeated calls to `ProcessConfirmationResolver.resolve()` are safe. Already-confirmed executions short-circuit without mutation.

**Authority:** Confirmation is derived from execution state, not independently asserted. The resolver reconciles; it does not grant authority.

---

## 3. Pipeline Trace

Full data flow for one timer tick through the operation:

```
TimerSource.pull(checkpoint)
  → SourceBatch { records: [SourceRecord], nextCheckpoint }
  → sourceRecordToFact(record, checkpoint)
    → Fact { fact_id, fact_type: "timer.tick", provenance, payload_json }
  → FactStore.ingest(fact)
    → { fact, isNew: true }
  → (sync cycle continues; facts accumulated)
  → FactStore.getUnadmittedFacts(scopeId)
    → Fact[]
  → TimerContextStrategy.formContexts(facts, scopeId)
    → PolicyContext { context_id: "timer:hourly_health_check", ... }
  → DefaultForemanFacade.onFactsAdmitted(facts, scopeId)
    → onContextsAdmitted(contexts, scopeId)
      → work_item INSERT (status: "opened")
  → SqliteScheduler.scanForRunnableWork(scopeId)
    → WorkItem[]
  → SqliteScheduler.acquireLease(workItemId)
    → LeaseResult { success: true }
  → SqliteScheduler.startExecution(workItemId, revisionId, envelopeJson)
    → ExecutionAttempt { execution_id, ... }
  → Charter runtime evaluates invocation envelope
    → CharterOutputEnvelope { proposed_actions: [{ action_type: "process_run", ... }] }
  → persistEvaluation(output, attempt)
    → evaluation INSERT
  → DefaultForemanFacade.resolveWorkItem({ work_item_id, execution_id, evaluation_id })
    → governEvaluation(evaluation, policy)
      → outcome: "accept", governed_action: process_run
    → IntentHandoff.admitIntentFromDecision(decision)
      → intent INSERT (status: "admitted", intent_type: "process.run")
    → work_item UPDATE (status: "resolved")
  → ProcessExecutor.processNext()
    → finds intent, creates ProcessExecution
    → spawn(command, args)
    → wait for close
    → execution UPDATE (status: "completed", exit_code: 0)
    → intent UPDATE (status: "completed", target_id: executionId)
  → ProcessConfirmationResolver.resolve(intentId)
    → execution.confirmation_status = "confirmed"
```

---

## 4. Forbidden Shortcuts

The following shortcuts are explicitly forbidden for the Timer → Process operation:

| # | Shortcut | Why Forbidden | Correct Path |
|---|----------|-------------|--------------|
| 1 | Direct subprocess spawn outside `ProcessExecutor` | Bypasses intent durability, idempotency, and lease recovery | Always create a `process.run` intent; let `ProcessExecutor` consume it |
| 2 | Charter runtime writing to coordinator store | Violates sandbox invariant | Charter produces output envelope; foreman consumes it |
| 3 | Charter runtime writing to intent store | Violates sandbox invariant | Foreman creates intents via `IntentHandoff` |
| 4 | Creating `process.run` intent without a foreman decision | Bypasses policy governance and approval gates | Decision → `IntentHandoff.admitIntentFromDecision()` |
| 5 | Modifying `process_executions` outside `ProcessExecutor` | Violates executor exclusivity | Only `ProcessExecutor` may create/update execution records |
| 6 | Bypassing `work_item` lifecycle and spawning directly from fact | Bypasses scheduler leasing and charter evaluation | Full pipeline: fact → context → work → evaluation → decision → intent → execution |
| 7 | Using `confirmation_model: "explicit"` for `process.run` | Process execution is self-confirming via exit code; explicit confirmation adds no value | `confirmation_model: "none"` is correct |
| 8 | Allowing arbitrary commands without policy bounding | Safety risk; commands should be pre-approved diagnostic scripts | Policy restricts `allowed_actions` to `["process_run", "no_action"]`; charter prompt further bounds command selection |
| 9 | Creating timer work items outside foreman admission | Violates foreman exclusivity (Invariant 6) | Only `DefaultForemanFacade.onFactsAdmitted()` may open work items |
| 10 | Skipping `require_human_approval` for unbounded process execution | Autonomous subprocess execution is unsafe for v0 | Default posture: `require_human_approval: true` |

---

## 5. v0 Non-Goals

The following are explicitly out of scope for the v0 Timer → Process operation proof:

| Non-Goal | Reason |
|----------|--------|
| **Multi-schedule operations** | v0 uses a single timer source per operation. Multi-schedule composition is a future config schema extension. |
| **Dynamic schedule configuration** | Schedule interval is fixed at config load time. Runtime schedule changes require operation restart. |
| **Cross-schedule context sharing** | Each `schedule_id` forms its own context. No cross-context work items in v0. |
| **Process output as new facts** | Process stdout is stored in `ProcessExecution.result_json`, not re-ingested as facts. Feedback loops are a future feature. |
| **Process execution chaining** | One work item produces one process intent. Chaining (intent A triggers work item B) is not supported in v0. |
| **Unattended autonomous execution** | The unattended layer (Task 391+) is a future target. v0 requires operator review for all `process_run` actions. |
| **Custom materializers per schedule** | All timer contexts use `TimerContextMaterializer`. Per-schedule materializer selection is future work. |
| **Filesystem or webhook co-triggering** | This is a single-vertical operation. Multi-vertical operations (timer + filesystem) are not in v0 scope. |
| **Real charter runtime evaluation** | v0 proof uses fixture-backed evaluation (hardcoded or mock runner). Real LLM evaluation is the live proof boundary (Task 520+). |
| **Production health alerting** | Health decay and operator notifications are part of the unattended layer, not the v0 operation proof. |

---

## 6. Reused vs New Components

### 6.1 Reused Without Change

| Component | Location | Reuse Evidence |
|-----------|----------|----------------|
| `TimerSource` | `src/sources/timer-source.ts` | Already exists, fully tested |
| `TimerContextStrategy` | `src/foreman/context.ts` | Already exists, fully tested |
| `TimerContextMaterializer` | `src/charter/envelope.ts` | Already exists, fully tested |
| `DefaultForemanFacade` | `src/foreman/facade.ts` | Vertical-agnostic; no timer-specific code needed |
| `SqliteScheduler` | `src/scheduler/scheduler.ts` | Vertical-agnostic; no timer-specific code needed |
| `ProcessExecutor` | `src/executors/process-executor.ts` | Already exists, fully tested |
| `ProcessExecutionStore` | `src/executors/store.ts` | Already exists, fully tested |
| `ProcessConfirmationResolver` | `src/executors/confirmation.ts` | Already exists, fully tested |
| `SqliteFactStore` | `src/facts/store.ts` | Vertical-agnostic; `timer.tick` is already a registered `FactType` |
| `sourceRecordToFact` | `src/facts/record-to-fact.ts` | Already handles `timer.tick` inference |
| `INTENT_FAMILIES["process.run"]` | `src/intent/registry.ts` | Already registered with schema and validation |
| `governAction` / `validateProcessRunPayload` | `src/foreman/governance.ts` | Already handles `process_run` payload validation |
| `toExecutorFamily("process_run")` | `src/intent/types.ts` | Already maps to `"process"` |
| `toIntentType("process_run")` | `src/intent/types.ts` | Already maps to `"process.run"` |
| `IntentHandoff` | `src/foreman/handoff.ts` | Vertical-agnostic; handles all intent families uniformly |
| `resolveVertical()` | `src/charter/envelope.ts` | Already recognizes `timer:` prefix |

### 6.2 New Components Required

| Component | Purpose | Bound |
|-----------|---------|-------|
| `maintenance_steward` charter prompt | Defines the charter's role, boundaries, and tone for health-check operations | ~50 lines; can reuse `support_steward` structure |
| Timer source config template in `init-repo` | CLI scaffolding for timer-based operations | Config schema extension; bounded to one template |
| Operation-specific policy config | `allowed_actions`, `require_human_approval`, schedule binding | JSON config; no code change |

### 6.3 Verification: Zero Kernel Changes Required

The Timer → Process operation requires **no changes** to any of the following kernel invariants:
- Source interface (`Source.pull()`)
- Fact identity (`buildFactId()`)
- Context formation interface (`ContextFormationStrategy`)
- Foreman admission invariants (Invariant 6)
- Scheduler lease invariants (Invariant 15)
- Intent registry (`INTENT_FAMILIES`)
- Executor lifecycle (`ExecutionPhase`, `ConfirmationStatus`)
- Observation read-only boundary (Invariant 19)

This is the core portability claim: a new operation family travels through the **same kernel** without kernel modification.

---

## 7. Verification Evidence

### 7.1 Fixture Test Coverage

The following tests verify each boundary stage:

| Boundary | Test | File | Status |
|----------|------|------|--------|
| Fact ingestion | `end-to-end: timer tick generates a fact` | `test/integration/control-plane/timer-to-process.test.ts` | ✅ 4/4 pass |
| Context formation | `TimerContextStrategy.formContexts` groups by schedule_id | `test/unit/foreman/context.test.ts` | ✅ 16/16 pass |
| Foreman admission | `end-to-end: foreman opens work item from filesystem fact` (analogous path) | `test/integration/control-plane/filesystem-vertical.test.ts` | ✅ 5/5 pass |
| Foreman resolution | `end-to-end: foreman resolves process_run into a process intent` | `test/integration/control-plane/timer-to-process.test.ts` | ✅ 4/4 pass |
| Intent creation | `both verticals travel through the same foreman → scheduler → execution path` | `test/integration/control-plane/vertical-parity.test.ts` | ✅ 4/4 pass |
| Process execution | `end-to-end: process executor runs timer-driven intent durably` | `test/integration/control-plane/timer-to-process.test.ts` | ✅ 4/4 pass |
| Idempotency | `replay safety: duplicate intent does not re-execute` | `test/integration/control-plane/timer-to-process.test.ts` | ✅ 4/4 pass |
| Confirmation | `ProcessConfirmationResolver.resolve` idempotency | `test/unit/executors/confirmation.test.ts` | ✅ 13/13 pass |
| Process executor unit | `process-executor.test.ts` | `test/unit/executors/process-executor.test.ts` | ✅ 11/11 pass |
| Timer source unit | `timer-source.test.ts` | `test/unit/sources/timer-source.test.ts` | ✅ 8/8 pass |

### 7.2 Typecheck Verification

- `pnpm typecheck`: all 11 packages pass ✅

### 7.3 Bounded Blockers for Live Proof

| Blocker | Bound | Status |
|---------|-------|--------|
| `maintenance_steward` charter prompt | ~50 lines; reuse `support_steward` structure | Not yet authored — bounded content task |
| Timer config in `init-repo` | Config template extension | Not yet wired — bounded CLI task |
| Live process execution trust | `require_human_approval: true` default | Already enforced by policy |

All blockers are bounded content/configuration tasks. No architectural blockers remain.

---

## 8. Relation to Task 520

Task 520 (Traveling Proof Plan And Fixture Contract) will define:
- The exact fixture shapes for the v0 proof
- The live vs fixture boundary
- The operator review loop for process_run approval
- The confirmation replay path for process execution

This decision (519) provides the boundary contract. Task 520 provides the proof plan.

---

## Related Documents

- [`.ai/decisions/20260423-518-second-operation-selection-contract.md`](20260423-518-second-operation-selection-contract.md) — Selection decision
- [`docs/product/first-operation-proof.md`](../../docs/product/first-operation-proof.md) — Canonical mailbox operation proof (template)
- [`packages/layers/control-plane/src/sources/timer-source.ts`](../../packages/layers/control-plane/src/sources/timer-source.ts) — TimerSource
- [`packages/layers/control-plane/src/foreman/context.ts`](../../packages/layers/control-plane/src/foreman/context.ts) — TimerContextStrategy
- [`packages/layers/control-plane/src/executors/process-executor.ts`](../../packages/layers/control-plane/src/executors/process-executor.ts) — ProcessExecutor
- [`packages/layers/control-plane/src/executors/confirmation.ts`](../../packages/layers/control-plane/src/executors/confirmation.ts) — ProcessConfirmationResolver
- [`packages/layers/control-plane/src/intent/registry.ts`](../../packages/layers/control-plane/src/intent/registry.ts) — Intent family registry
- [`packages/layers/control-plane/src/foreman/governance.ts`](../../packages/layers/control-plane/src/foreman/governance.ts) — Action governance
