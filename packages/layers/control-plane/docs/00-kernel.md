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
  priority: number;
  opened_for_revision_id: string;
  // Continuation affinity — advisory routing preference (Task 212)
  preferred_session_id: string | null;
  preferred_agent_id: string | null;
  affinity_group_id: string | null;
  affinity_strength: number;
  affinity_expires_at: string | null;
  affinity_reason: string | null;
}
```

- Work is the **terminal schedulable unit**.
- At most one non-terminal work item per context may be `leased` or `executing`.
- Supersession replaces stale work with new work when a higher revision arrives.
- **Continuation affinity** is a soft routing preference derived from recent work on the same context. It is advisory — the scheduler may honor it when ordering runnable work, but must never block correctness waiting for a specific session. Affinity expires automatically to prevent stale sticky routing.
- **v1 scope**: Affinity affects ordering only (`scanForRunnableWork` sort key). Session-targeted lease acquisition and runner selection are deferred to v2. The scheduler does not check whether `preferred_session_id` is available or alive before assigning a lease.

#### Continuation Affinity vs. Resume Hint

| Concept | Purpose | Stored On | Consumer |
|---------|---------|-----------|----------|
| `continuation_affinity` | Routing preference for scheduler | `WorkItem` | Scheduler (ordering), Foreman (derivation) |
| `resume_hint` | Operator-visible trace of continuity | `AgentSession` | Observation API, operator console |

- Affinity is set when a work item is opened, based on the most recent session for the same context.
- On supersession, affinity is carried forward from the superseded work item to the new one.
- Affinity has a bounded lifetime (`affinity_expires_at`). After expiry, the scheduler treats the item as having no affinity.
- Affinity never overrides authority: governance, leasing, and scheduling invariants remain unchanged.

### 3.5 Policy / Foreman

The foreman performs three authorities:

1. **Admission** — `onFactsAdmitted()` opens/supersedes work items from `PolicyContext[]`.
2. **Governance** — `resolveWorkItem()` validates charter output, applies policy, and decides accept / reject / escalate / no-op.
3. **Handoff** — On acceptance, atomically persists the decision and emits an `Intent`.

Policy is the **sole gate to effects**. No effect may materialize without passing through foreman governance.

#### Explicit Replay and Recovery Derivation

In addition to live admission, the foreman exposes two operator-triggered surfaces over the same derivation core:

**Replay surface** — `deriveWorkFromStoredFacts()`:
- Reads already-stored facts independently of `admitted_at`
- Routes through the same `ContextFormationStrategy` → `onContextsAdmitted` pipeline as live dispatch
- Does **not** mark facts as admitted
- Intended for re-running an old conversation or testing a policy change against synced data

**Recovery surface** — `recoverFromStoredFacts()`:
- Uses the exact same derivation core as replay (context formation → `onContextsAdmitted`)
- Distinct in naming and intended authority (`admin` vs `derive` + `resolve`)
- Intended for loss-shaped recovery when coordinator state is lost but facts remain intact
- Conservative: does not restore active leases, in-flight execution attempts, or submitted outbound effects

Both support re-deriving work without fabricating a new inbound source event.

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

### 4.9 Advisory Signals Are Non-Authoritative

Advisory signals may influence routing, timing, review, and attention decisions, but they must not override durable or authority invariants.

- A scheduler may consult a `continuation_affinity` signal when assigning a lease, but the lease record is the authoritative commitment. *(This is the only advisory signal currently implemented.)*
- A foreman may consult a `low_confidence_proposal` signal when resolving work, but the decision record is the authoritative outcome. *(Illustrative — not yet implemented.)*
- An operator console may display `likely_needs_human_attention` signals, but an operator action still routes through `executeOperatorAction()` with safelisted mutations and audit logging. *(Illustrative — not yet implemented.)*

**Kernel invariant**: Removing every advisory signal from the system must leave all durable boundaries intact and all authority invariants satisfiable. If a component requires an advisory signal to function correctly, that signal has been incorrectly promoted to authority.

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
9. **Audited operator control** — The operator console may request actions only through `executeOperatorAction()` with safelisted actions. The current safelist is: `retry_work_item`, `retry_failed_work_items`, `acknowledge_alert`, `rebuild_views`, `rebuild_projections`, `request_redispatch`, `trigger_sync`, `derive_work`, `preview_work`. Every action is logged to `operator_action_requests`. This is the sole permitted operator path from the observation UI.

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

## 8. Re-Derivation and Recovery Operators

The kernel supports a family of explicit operators that recompute downstream state from durable boundaries. These are formalized in [`SEMANTICS.md`](../../../../SEMANTICS.md) §2.8. In kernel terms:

### 8.1 Operator Algebra

```text
Boundary A → Boundary B
mode: live | replay | preview | recovery | rebuild | confirm
effect: read-only | control-plane-mutating | external-confirmation-only
```

### 8.2 Durable Boundary Pairs

| Upstream Boundary | Downstream Boundary | Canonical Path |
|-------------------|---------------------|----------------|
| `Fact` (unadmitted) | `Fact` (admitted) + `Work` | Live dispatch: `getUnadmittedFacts` → `onFactsAdmitted()` → `markAdmitted()` |
| `Fact` (stored) | `Work` | Replay: `getFactsByScope` → `deriveWorkFromStoredFacts()` → (no admission marking) |
| `Fact` (stored) | `Context`/`Work` | Recovery: `getFactsByScope` → `recoverFromStoredFacts()` → (no admission marking; same core as replay) |
| `Fact` (stored) | `PolicyContext`/`Evaluation` | Preview: `getFactsByScope` → `formContexts` → `buildInvocationEnvelope` → `charterRunner.run()` → `governEvaluation`. Stops before `onContextsAdmitted()` — no work items, leases, or intents created. |
| `Durable state` (facts + decisions + intents) | `Observation` views | `ProjectionRebuildRegistry.rebuildAll()` — rebuilds registered projections (filesystem views from `messages/`, search index from `messages/`) |
| `Execution` / `OutboundCommand` | `Confirmation` | Reconciliation queries against external state |

### 8.3 Kernel Invariants for Re-Derivation

1. **Same Path**: Replay, recovery, and preview must use the same `ContextFormationStrategy` and `ForemanFacade` interfaces as live admission. No parallel work-opening algorithm.
2. **No Fabrication**: Replay, preview, and recovery must not create synthetic `Source` records or `Fact` payloads that did not originate from a real source pull.
3. **Bounded Trigger**: All non-live operators are explicitly operator-triggered. The daemon must not automatically replay, recover, or rebuild on startup.
4. **No Admission Side Effect in Replay or Recovery**: Replay and recovery derivation must not transition fact lifecycle state (`admitted_at`). Fact admission is the exclusive side effect of live dispatch.
5. **Preview is Read-Only**: Preview derivation must not create work items, leases, execution attempts, durable evaluation records, decisions, intents, or outbound commands. It may produce transient evaluation output and may read from durable stores, but it must not write to canonical durable boundaries.
6. **Authority Preserved**: Replay-derived and recovery-derived work items are opened by the foreman, leased by the scheduler, and executed by registered workers — the same authority chain as live-derived work.
7. **Conservative Recovery**: Recovery does not restore active leases, in-flight execution attempts, or already-submitted outbound effects.
8. **Projection Rebuild Non-Authority**: Projection rebuild may discard and recompute derived stores (views, search indexes) without affecting correctness. It must not mutate canonical durable truth, create work items, or produce external effects.

---

## 9. Selection Operators

The kernel supports a canonical `Selector` type for bounding operator input sets. Selection is formalized in [`SEMANTICS.md`](../../../../SEMANTICS.md) §2.9. In kernel terms:

### 9.1 Selector Dimensions

| Dimension | Type | Target Layers |
|-----------|------|---------------|
| `scopeId` | `string \| string[]` | All |
| `since` | `ISO 8601` | Fact, Context, Work |
| `until` | `ISO 8601` | Fact, Context, Work |
| `factIds` | `string[]` | Fact |
| `contextIds` | `string[]` | Context, Work |
| `workItemIds` | `string[]` | Work |
| `status` | `string` | Work, Intent, Outbound |
| `vertical` | `string` | Fact, Context |
| `limit` | `number` | All |
| `offset` | `number` | All |

### 9.2 Kernel Invariants for Selection

1. **Read-Only**: Selectors are evaluated without mutation. No `.run()`, `.exec()`, or store mutation may occur during selector evaluation.
2. **Authority-Neutral**: Selector evaluation does not check authority classes.
3. **Closed Grammar**: The dimensions above are the complete grammar. New dimensions require kernel spec revision, not ad-hoc addition.
4. **Uniform Consumption**: All bounded operators must accept a canonical `Selector`. Ad-hoc option bags are deprecated.
5. **Honest Applicability**: An operator must reject — not silently ignore — selector dimensions that do not apply to its target entity family. For example, `status` and `workItemIds` are not applicable to fact selection and must produce a clear error.

---

## 10. Promotion Operators

The kernel supports explicit promotion of artifacts through lifecycle transitions. Promotion is formalized in [`SEMANTICS.md`](../../../../SEMANTICS.md) §2.10. In kernel terms:

### 10.1 Promotable Objects

| Object | Source State | Target State | Authority |
|--------|--------------|--------------|-----------|
| `operation` | `inactive` | `active` | `admin` |
| `work_item` | `failed_retryable` | `failed_retryable` (retry readiness promoted) | `resolve` |
| `work_item` | `failed_retryable` | `failed_terminal` | `admin` |
| `evaluation` | `preview` | `governed_work` | `derive` + `resolve` |
| `outbound_command` | `draft_ready` | `submitted` | `execute` |
| `outbound_command` | `pending` | `cancelled` | `execute` |

### 10.2 Kernel Invariants for Promotion

1. **Explicit Trigger**: All promotion transitions require an explicit operator action. The daemon must not auto-promote.
2. **No Boundary Fabrication**: Promotion must not create synthetic `Fact` or `Source` records. Preview → governed work routes through the same foreman admission path as live facts.
3. **Authority Preserved**: Each transition declares its authority class. The operator action layer validates before executing.
4. **Audit Trail**: Every promotion transition is logged to `operator_action_requests`.
5. **Scheduler Neutrality**: Promotion does not manipulate leases directly. Retry-style promotion clears `next_retry_at` without changing work-item status; the scheduler discovers the newly runnable item on its next scan. Status-changing promotion (e.g., to `failed_terminal`) transitions the status directly.

---

## 11. Inspection Operators

The kernel supports read-only inspection of durable and derived state. Inspection is formalized in [`SEMANTICS.md`](../../../../SEMANTICS.md) §2.11. In kernel terms:

### 11.1 Inspection Targets

| Target | Layer | Examples |
|--------|-------|----------|
| `Fact` | Durable | `FactStoreView.getById`, `getFactsByScope` |
| `Context` | Durable | `CoordinatorStoreView.getContextRecord`, `getLatestRevisionOrdinal` |
| `WorkItem` | Durable | `CoordinatorStoreView.getWorkItem`, `getActiveWorkItemForContext` |
| `Execution` | Durable | `CoordinatorStoreView.getExecutionAttempt`, `getEvaluationsByWorkItem` |
| `Observation` | Derived | `ObservationPlane` routes, `ControlPlaneStatusSnapshot` |
| `Backup` | Derived | `backup-verify`, `backup-ls` |

### 11.2 Kernel Invariants for Inspection

1. **Read-Only**: Inspection methods use only `.all()`, `.get()`, `.pluck()`. No `.run()`, `.exec()`, or direct mutation calls.
2. **Authority-Agnostic**: Inspection requires no authority class. Observation routes are gated by scope access only.
3. **Projection Non-Authority**: Derived views may be discarded and recomputed without affecting system correctness.
4. **Boundary Respect**: Inspection does not re-compute from durable boundaries. Preview derivation (§8) handles re-computation; inspection reads already-derived state.

---

## 12. Known Gaps (Honest)

The following are acknowledged boundaries between the spec and the current implementation:

1. **Graph adapter** is the most mature adapter; webhook and timer sources exist but lack production-hardened retry and backoff policies.
2. **Observation plane** is complete for local SQLite queries, but no remote telemetry or metrics exporter exists.
3. **Multi-source scope** — running multiple sources for the same scope with consistent checkpointing is not yet implemented.
4. **Filesystem vertical** is listed as a future expansion point; only mailbox, timer, and webhook have real implementations.
5. **Confirmation for process family** currently stops at `completed` / `failed`; there is no external reconciliation loop equivalent to mail's `submitted → confirmed` binding.

---

## 13. See Also

- [`01-spec.md`](01-spec.md) — Mailbox-vertical dearbitrized specification
- [`02-architecture.md`](02-architecture.md) — Component layers and data flow
- [Root `AGENTS.md`](../../AGENTS.md) — Navigation hub and authority boundaries
