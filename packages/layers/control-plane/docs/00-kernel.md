# Narada Irreducible Kernel Spec

> Normative lawbook for the generalized deterministic kernel.
> Mailbox is one vertical. Timer, webhook, filesystem, and process are peers.
>
> For canonical term definitions, see [`SEMANTICS.md`](../../../../SEMANTICS.md). This document formalizes interfaces and invariants that use those terms.

---

## 1. Kernel Identity

Narada is a **deterministic state compiler** from remote source deltas into local canonical state, with a durable control plane for governed side-effects.

It is not a sync client, cache, mirror, or transport layer.

---

## 2. The Nine Layers

All verticals traverse the same pipeline:

```
Source → Fact → Context → Work → Policy → Intent → Execution → Confirmation → Observation
```

| Layer | Responsibility | Durable? |
|-------|----------------|----------|
| **Source** | Pulls records from a remote or local origin using an opaque checkpoint. | Checkpoint only |
| **Fact** | Canonical, replay-stable envelope of every observed change. | **Yes** |
| **Context** | Groups facts into policy-relevant scopes (`context_id`, `scope_id`). | No |
| **Work** | Terminal schedulable unit opened for a context revision. | **Yes** |
| **Policy** | Admits, supersedes, or rejects work; governs proposed effects. | Decision: **Yes** |
| **Intent** | Universal durable effect boundary (`intent_type` + `executor_family`). | **Yes** |
| **Execution** | Claims intent and performs the effect (mail, process, etc.). | **Yes** |
| **Confirmation** | Binds execution outcome back to durable state (submitted → confirmed / failed). | **Yes** |
| **Observation** | Read-only derived views over durable state. | No |

---

## 3. Core Abstractions

### 3.1 Source

```typescript
interface Source {
  readonly sourceId: string;
  pull(checkpoint?: Checkpoint | null): Promise<SourceBatch>;
}
```

- The checkpoint is **opaque** to the kernel.
- Re-pulling may return overlapping records; deduplication is the kernel's responsibility.
- Source-specific semantics live inside `SourceRecord.payload`, not in kernel law.

### 3.2 Fact

```typescript
interface Fact {
  fact_id: string;           // deterministic, replay-stable
  fact_type: FactType;       // e.g. "mail.message.discovered", "timer.tick", "webhook.received"
  provenance: FactProvenance;
  payload_json: string;      // opaque, vertical-specific
  created_at: string;
}
```

- Facts are the **first canonical durable boundary**.
- All replay determinism derives from fact identity.
- Fact store ingestion is idempotent (`fact_id` primary key).

### 3.3 Context Formation

```typescript
interface ContextFormationStrategy {
  formContexts(facts: Fact[], scopeId: string): PolicyContext[];
}
```

- A `PolicyContext` contains: `context_id`, `scope_id`, `revision_id`, `change_kinds`, `facts`.
- `context_id` is domain-neutral. For mailbox it may be a conversation; for timer it may be `timer:{schedule_id}`; for webhook it may be `webhook:{endpoint_id}`.
- No kernel section may assume `conversation_id`, `thread_id`, or message semantics.

### 3.4 Work

```typescript
interface WorkItem {
  work_item_id: string;
  context_id: string;
  scope_id: string;
  status: "opened" | "leased" | "executing" | "resolved" | ...;
  opened_for_revision_id: string;
}
```

- Work is the **terminal schedulable unit**.
- At most one non-terminal work item per context may be `leased` or `executing`.
- Supersession replaces stale work with new work when a higher revision arrives.

### 3.5 Policy / Foreman

The foreman performs three authorities:

1. **Admission** — `onFactsAdmitted()` opens/supersedes work items from `PolicyContext[]`.
2. **Governance** — `resolveWorkItem()` validates charter output, applies policy, and decides accept / reject / escalate / no-op.
3. **Handoff** — On acceptance, atomically persists the decision and emits an `Intent`.

Policy is the **sole gate to effects**. No effect may materialize without passing through foreman governance.

### 3.6 Intent

```typescript
interface Intent {
  intent_id: string;
  intent_type: string;        // e.g. "mail.send_reply", "process.run"
  executor_family: string;    // e.g. "mail", "process"
  payload_json: string;
  idempotency_key: string;    // deterministic per (context, action, payload)
  status: IntentStatus;
  context_id: string;
}
```

- Intent is the **universal durable effect boundary**.
- All side effects (mail sends, process spawns, future automations) must be represented as an Intent before execution.
- Idempotency is enforced at `idempotency_key`.

### 3.7 Execution

Executors claim admitted Intents and perform effects:

- **Mail family** → `OutboundHandoff` creates `OutboundCommand`, workers mutate Graph state.
- **Process family** → `ProcessExecutor` spawns a subprocess, records exit code.
- Future families follow the same lifecycle algebra (`admitted → started → completed / failed`).

### 3.8 Confirmation

Confirmation binds the external effect back to durable state:

- `submitted` — executor received external acceptance.
- `confirmed` — inbound observation or reconciliation proves the effect took hold.
- `failed` — external rejection or timeout.

Confirmation status is **derived from durable store state**, not in-memory or log state.

### 3.9 Observation

The observation plane provides **read-only, reconstructible views** over durable state.

- Non-authoritative: may be deleted and rebuilt without affecting correctness.
- No scheduler, lease, executor, or sync path may depend on observation artifacts.
- Operator visibility must not require terminal attachment.

---

## 4. Invariants

### 4.1 Replay Determinism

```
replay(E, S0) ⇒ S*
replay(E, replay(E, S0)) ⇒ S*
```

`normalize(remote_data)` and `sourceRecordToFact(record)` must be deterministic.

### 4.2 Durable Boundaries

Loss of any non-ephemeral state below must be recoverable from the boundary itself:

- **Fact store** — canonical observed history
- **Apply-log** — idempotency gate for source records
- **Work items + leases + execution attempts** — control-plane progress
- **Intents** — effect proposals
- **Execution records** — effect outcomes

### 4.3 Policy as Sole Gate to Effects

No `Intent` may be created outside the foreman's atomic handoff transaction.
No executor may bypass the Intent boundary to perform a side effect.

### 4.4 Intent as Universal Effect Boundary

Every side effect (mail, process, future) must:

1. Be represented as an `Intent`
2. Pass through `idempotency_key` enforcement
3. Be claimed by a registered worker before execution

### 4.5 Observation Non-Authority

Observation reads may never write.
Deleting all logs and traces must not alter control-plane behavior.

### 4.6 Mailbox as One Vertical

No kernel section may require:

- `conversation_id`
- `thread_id`
- Graph-specific concepts
- message semantics
- mailbox-specific action assumptions

These are properties of the **mail vertical**, not the kernel.

### 4.7 Apply Ordering

```
apply(record) → mark_applied(recordId) → cursor_commit(nextCheckpoint)
```

The cursor must never advance before all records ≤ cursor have been durably applied.

### 4.8 Lease Uniqueness

A work item has at most one unreleased, unexpired lease at any time.

---

## 5. Failure Model

### 5.1 Crash Recovery

The system may crash at any point. Recovery proceeds using only durable state:

| Crash point | Recovery behavior |
|-------------|-------------------|
| Before apply | Record not in apply-log → reapplied on next pull |
| After apply, before mark_applied | Record reapplied → must be idempotent |
| After mark_applied, before cursor commit | Record skipped on replay → safe |
| After work opened, before lease | Work item remains `opened` → scheduler picks it up |
| After lease acquired, before execution | Lease expires → recovered as stale, work reset |
| After decision committed, before work resolved | Decision record exists → resolves to `action_created` on replay |
| After process intent admitted, before subprocess completion | Process execution lease expires → `ProcessExecutor.recoverStaleExecutions()` resets intent to `admitted` |

**Note on dual recovery**: Work item leases (scheduler) and process execution leases (process executor) use intentionally distinct recovery models. See `docs/02-architecture.md` § "Dual Recovery Model".

### 5.2 Idempotency Boundaries

- Source record idempotency: `apply_log` keyed by `recordId`
- Fact ingestion idempotency: `fact_id` primary key
- Intent idempotency: `idempotency_key` unique constraint
- Decision idempotency: `decision_id` primary key

---

## 6. Authority Boundaries

These boundaries are enforced by code structure:

1. **Foreman owns work opening** — Only `DefaultForemanFacade.onSyncCompleted()` (or `onFactsAdmitted()`) may insert `work_item` rows. Both delegate to a private `onContextsAdmitted()` that performs the actual insert.
2. **Foreman owns resolution** — Only `DefaultForemanFacade.resolveWorkItem()` may transition a `work_item` to terminal status based on charter output. It loads the evaluation by `evaluation_id` from the coordinator store; the runtime must persist the evaluation before calling the foreman.
3. **Foreman owns failure classification** — Only `DefaultForemanFacade.failWorkItem()` may transition a `work_item` to `failed_retryable` or `failed_terminal`. The scheduler releases leases and marks execution attempts crashed; the foreman classifies the semantic failure and applies retry backoff.
4. **Scheduler owns leases and mechanical execution lifecycle** — Only `SqliteScheduler` may insert/release `work_item_leases` and transition a work item into `leased` or `executing`. The scheduler may mark execution attempts as crashed/abandoned and release leases, but it does **not** semantically classify work-item failure status. The foreman does that via `failWorkItem()`.
5. **IntentHandoff owns intent creation** — Only `IntentHandoff.admitIntentFromDecision()` may create `intent` rows. It is called from within the foreman's atomic decision transaction.
6. **OutboundHandoff owns command creation** — All `outbound_command` + `outbound_version` rows for the mail family must be created inside `OutboundHandoff.createCommandFromDecision()`, called from `IntentHandoff`.
7. **Executors own mutation** — Only registered workers may perform external side effects.
8. **Charter runtime is read-only sandbox** — It may only read the invocation envelope and produce an output envelope. It must NOT write to coordinator or outbound stores, and it does NOT own evaluation persistence. The runtime (daemon dispatch) persists evaluations before handing them to the foreman.
9. **Audited operator control** — The operator console may mutate work items only through `executeOperatorAction()` with safelisted actions (`retry_work_item`, `acknowledge_alert`). Every action is logged to `operator_action_requests`. This is the sole permitted write path from the observation UI.

---

## 7. Extension Rules

**Allowed** (preserves invariants):
- New vertical sources (filesystem, webhook, API)
- New fact types
- New context formation strategies
- New executor families
- Richer payloads and stronger integrity checks

**Disallowed** without full redesign:
- Implicit deletes
- Cursor-first commit
- Non-deterministic normalization
- Externalized apply-log or intent store
- Direct writes to `work_item`, `work_item_leases`, or `execution_attempts` from outside foreman/scheduler
- Bypassing the Intent boundary to perform effects

---

## 8. Known Gaps (Honest)

The following are acknowledged boundaries between the spec and the current implementation:

1. **Graph adapter** is the most mature adapter; webhook and timer sources exist but lack production-hardened retry and backoff policies.
2. **Observation plane** is complete for local SQLite queries, but no remote telemetry or metrics exporter exists.
3. **Multi-source scope** — running multiple sources for the same scope with consistent checkpointing is not yet implemented.
4. **Filesystem vertical** is listed as a future expansion point; only mailbox, timer, and webhook have real implementations.
5. **Confirmation for process family** currently stops at `completed` / `failed`; there is no external reconciliation loop equivalent to mail's `submitted → confirmed` binding.

---

## 9. See Also

- [`01-spec.md`](01-spec.md) — Mailbox-vertical dearbitrized specification
- [`02-architecture.md`](02-architecture.md) — Component layers and data flow
- [Root `AGENTS.md`](../../AGENTS.md) — Navigation hub and authority boundaries
