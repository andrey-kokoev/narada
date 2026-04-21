# Architecture

> For the canonical, vertical-agnostic kernel lawbook, see [`00-kernel.md`](00-kernel.md).

## Component Overview

The system is organized into **eleven layers**: five control-plane layers above six deterministic compiler layers.

### Control Plane Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      Daemon Layer                                │
│  (polling loop, per-scope dispatch context, sync-to-dispatch    │
│   sequence, lease renewal, quiescence)                           │
├─────────────────────────────────────────────────────────────────┤
│                      Foreman Layer                               │
│  (work opening, revision supersession, decision arbitration)    │
├─────────────────────────────────────────────────────────────────┤
│                     Scheduler Layer                              │
│  (runnable work scan, lease acquisition, execution lifecycle)   │
├─────────────────────────────────────────────────────────────────┤
│                   Charter Runtime Layer                          │
│  (CharterInvocationEnvelope → bounded evaluation → output)      │
├─────────────────────────────────────────────────────────────────┤
│                    Tool Runner Layer                             │
│  (catalog resolution, request validation, subprocess/HTTP exec) │
├─────────────────────────────────────────────────────────────────┤
│                   Outbound Worker Layer                          │
│  (draft creation, approval, send execution, reconcile)         │
└─────────────────────────────────────────────────────────────────┘
```

### Compiler Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer                                │
│  (commands: sync, integrity-check, rebuild-views)               │
├─────────────────────────────────────────────────────────────────┤
│                       Runner Layer                               │
│  (DefaultSyncRunner - orchestrates sync cycles)                 │
├─────────────────────────────────────────────────────────────────┤
│                      Adapter Layer                               │
│  (GraphHttpClient, GraphDeltaWalker, DefaultGraphAdapter)       │
├─────────────────────────────────────────────────────────────────┤
│                     Normalization Layer                          │
│  (normalizeDeltaEntry, normalizeMessageToPayload, buildEventId) │
├─────────────────────────────────────────────────────────────────┤
│                     Persistence Layer                            │
│  (Cursor, ApplyLog, Messages, Tombstones, Views, Blobs, Lock)   │
├─────────────────────────────────────────────────────────────────┤
│                      Projector Layer                             │
│  (applyEvent - upsert/delete application logic)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Architectural Honesty Note: The Monolithic Control Plane

The diagrams above describe **logical** layers, not physical packages. At present, the entire control plane — foreman, scheduler, charter runtime integration, outbound pipeline, and coordinator store — lives inside a single package: `packages/layers/control-plane`.

This is intentional, not accidental. The interfaces between these layers are still stabilizing (e.g., `ResolveWorkItemRequest` shifted from accepting a full `EvaluationEnvelope` to an `evaluation_id` in Task 134; the coordinator schema is on its second major revision). Premature extraction into separate packages would create version-churn noise, cross-package type-duplication, and coordination overhead without delivering deployability benefits — the daemon, CLI, and kernel all ship together in the same repository.

**What is actually decomposed today:**
- **`packages/layers/cli`** — CLI entry points and commands (ships the `narada` binary)
- **`packages/layers/daemon`** — Long-running polling loop and HTTP servers (observation UI, webhooks)
- **`packages/layers/control-plane`** — Everything else: compiler, control plane, persistence, Graph adapter
- **`packages/verticals/search`** — FTS5 search index (already extracted because it has a distinct SQLite dependency and build step)
- **`packages/domains/charters`** — Charter definitions, policy types, and tool catalog (already extracted because it is the primary user-facing customization surface)

**Future extraction criteria:**
A control-plane layer will be promoted to its own package only when **all** of the following are true:
1. Its public interface has been stable for at least two minor releases (no breaking changes to types consumed by other layers).
2. It has a distinct release cadence or versioning need (e.g., the outbound worker may need faster iteration than the scheduler).
3. It requires a different dependency set that the kernel should not inherit (e.g., a future `process` executor may need heavy subprocess-management libraries).
4. There is a concrete operational reason to deploy it separately (e.g., a standalone worker pool).

Until then, the code maintains the layer boundaries through **directory structure and interface discipline** inside `packages/layers/control-plane/src/`, not package boundaries.

### Vocabulary Note

> For the canonical vocabulary and identity lattice, see [`SEMANTICS.md`](../../../../SEMANTICS.md).

- **`context_id`** is the canonical neutral identifier for a policy-relevant grouping of facts.
- **`conversation_id`** is the mailbox-vertical specialization of `context_id`.
- **`thread_id`** is legacy-only. It remains in some internal variable names, but all control-plane tables (`context_records`, `work_items`, `outbound_handoffs`) use `context_id`.

---

## Data Flow

### Sync Cycle Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Cursor     │────▶│   Adapter    │────▶│  NormalizedBatch │
│   (read)     │     │ fetch_since  │     │  (events[])      │
└──────────────┘     └──────────────┘     └──────────────────┘
                                                    │
                                                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Cursor     │◀────│   Runner     │◀────│   For each event │
│  (commit)    │     │  (iterate)   │     │                  │
└──────────────┘     └──────────────┘     └──────────────────┘
                                                    │
                    ┌───────────────────────────────┘
                    ▼
           ┌──────────────────┐
           │ ApplyLog.hasApplied│───No──▶ applyEvent()
           │   (check)        │              │
           └──────────────────┘              ▼
                    ▲                ┌──────────────────┐
                    └────────────────│ ApplyLog.markApplied
                                     │   (persist)      │
                                     └──────────────────┘
```

### Event Processing Flow

```
Graph Delta Entry
       │
       ▼
┌──────────────────┐
│ normalizeDelta   │
│    Entry()       │
└──────────────────┘
       │
       ├── @removed? ──Yes──▶ buildDeleteEvent()
       │                         │
       No                        ▼
       │                  ┌──────────────────┐
       ▼                  │   Delete Event   │
┌──────────────────┐      │  (no payload)    │
│ normalizeMessage │      └──────────────────┘
│   ToPayload()    │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│  buildEventId()  │◀── sha256(stable_stringify({...}))
└──────────────────┘
       │
       ▼
┌──────────────────┐
│   Upsert Event   │
│  (with payload)  │
└──────────────────┘
```

---

## End-to-End Control Plane Sequence

```text
REMOTE SOURCE
(mailbox vertical shown; timer/process are peers)
        │
        ▼ (Graph delta: new message, move, flag change)
┌───────────────────┐
│  narada           │  ← Deterministic compiler
│  (sync cycle)     │     Normalizes events, applies to filesystem,
│                   │     updates views, commits cursor
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Daemon           │  ← Emits SyncCompletionSignal
│  (dispatch phase) │     { changed_contexts: [...] }
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Foreman          │  ← Opens / supersedes work_items
│  (work opening)   │     Evaluates revision relevance
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Scheduler        │  ← Scans runnable work_items
│  (lease + run)    │     Acquires lease, starts execution_attempt
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Charter Runtime  │  ← Receives CharterInvocationEnvelope
│  (evaluation)     │     Produces CharterOutputEnvelope
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Foreman          │  ← Validates output, arbitrates,
│  (resolution)     │     writes foreman_decision + intent
│                   │     (or resolves as no-op / escalation)
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Worker Layer     │  ← Claims intent, executes effect
│  (mail / process) │     (draft creation, approval, send execution for mail; subprocess for process)
└─────────┬─────────┘
          │
          ▼
TERMINAL QUIESCENCE
        │
        ▼
Daemon sleeps until next wake (poll, retry timer, manual)
```

### Step Descriptions

1. **Remote Source Change** — Graph API (mailbox vertical) or timer tick reports a change.
2. **Sync / Ingest** — The compiler fetches deltas (or the timer emits a fact), normalizes to `Fact` records, applies to the local projection (e.g. `messages/` and `views/`), writes `apply-log` markers, and commits the cursor.
3. **Work Opening** — The daemon calls `foreman.onSyncCompleted(signal)`. The foreman inserts `work_item` rows for changed contexts, superseding stale ones when necessary.
4. **Scheduling** — The scheduler scans for runnable work items, acquires leases, and transitions items to `leased`.
5. **Evaluation** — The scheduler inserts an `execution_attempt` and transitions the item to `executing`. The charter runtime receives a frozen `CharterInvocationEnvelope` and produces a `CharterOutputEnvelope`.
6. **Tool Execution** — Approved *read-only* tool requests are executed by the tool runner, with results logged to `tool_call_records`. Non-read-only requests are rejected with `rejected_policy` records (Phase A guardrail).
7. **Proposal / Intent Creation** — The foreman validates output (`validation.ts`), applies governance (`governance.ts`), writes a `foreman_decisions` row, and creates an `intent` in the same SQLite transaction. The work item transitions to `resolved`.
8. **Worker Execution** — The appropriate worker claims the intent and executes the effect:
   - `SendReplyWorker` creates Graph drafts for `mail.send_reply` and `mail.draft_reply` intents
   - `SendExecutionWorker` performs the actual Graph send only for commands explicitly approved via `approved_for_send`
   - `NonSendWorker` executes `mark_read`, `move_message`, and `set_categories`
   - `OutboundReconciler` transitions `submitted` → `confirmed` based on observed remote state
   - `ProcessExecutor` spawns a subprocess for `process.run` intents
9. **Terminal Quiescence** — The scheduler finds no runnable work, valid leases, or expired retry timers. The daemon sleeps until the next wake.

### Vertical Parity

Both the **mailbox vertical** and the **timer/process vertical** use the same kernel layers:

| Layer | Mailbox Vertical | Timer/Process Vertical |
|-------|------------------|------------------------|
| Source | `ExchangeSource` (Graph API) | `TimerSource` (local timer) |
| Fact | `mail.message.discovered` | `timer.tick` |
| Policy | Mailbox charter family | Same charter family (or a timer-specific policy) |
| Intent | `mail.send_reply`, `mail.mark_read` | `process.run` |
| Execution | Outbound workers | `ProcessExecutor` |
| Observation | Control plane snapshot | Control plane snapshot |

The kernel types (`Source`, `Fact`, `Intent`, `Scheduler`, `WorkerRegistry`) remain neutral to the vertical.

### Dual Recovery Model (Intentionally Distinct)

The control plane operates **two separate lease/recovery substrates** by design:

| | Scheduler Leases | Process Executor Leases |
|---|------------------|------------------------|
| **What** | Charter execution work items | Subprocess intents (`process.run`) |
| **Table** | `work_item_leases` | `process_executions` (inline columns) |
| **Owner** | `SqliteScheduler` | `ProcessExecutor` |
| **Recovery method** | `recoverStaleLeases()` | `recoverStaleExecutions()` |
| **Stale outcome** | Lease released, attempt abandoned (mechanical); foreman → `failed_retryable` / `failed_terminal` (semantic) | Execution → `failed`, intent → `admitted` |
| **Retry authority** | Scheduler (`scanForRunnableWork`) | WorkerRegistry (re-claims admitted intent) |
| **Called by daemon** | Before dispatch loop (`recoverStaleLeases` + `foreman.failWorkItem`) | After dispatch loop, before worker drain |

**Why they are not unified:**
1. **Different lifecycle semantics** — Work items are long-lived, retryable, and stateful (backoff, session). Process intents are short-lived, fire-and-forget subprocesses.
2. **Different retry authority** — Scheduler owns work item retry scheduling; `WorkerRegistry` owns intent re-execution.
3. **Different schemas** — Work item leases have a dedicated table with release tracking; process executions embed lease fields in the execution record.

Unification would require elevating process intents to first-class work items under scheduler authority. That is a valid future architectural direction, but the current dual model is **intentional and operationally sound**.

Both recovery paths are called explicitly by the daemon dispatch loop. Do not silently omit either.

---

## Interface Boundaries

### Runtime Interfaces (`src/types/runtime.ts`)

These define the contracts between layers:

```typescript
// Adapter boundary
interface GraphAdapter {
  fetch_since(cursor?: CursorToken | null): Promise<NormalizedBatch>;
}

// Persistence boundaries
interface CursorStore {
  read(): Promise<CursorToken | null>;
  commit(nextCursor: CursorToken): Promise<void>;
}

interface ApplyLogStore {
  hasApplied(eventId: EventId): Promise<boolean>;
  markApplied(event: NormalizedEvent): Promise<void>;
}

// Projection boundary
interface Projector {
  applyEvent(event: NormalizedEvent): Promise<ApplyEventResult>;
}

// Runner boundary
interface SyncRunner {
  syncOnce(): Promise<RunResult>;
}
```

### Control-Plane Interfaces

```typescript
// Foreman boundary
interface ForemanFacade {
  onSyncCompleted(signal: SyncCompletionSignal): Promise<WorkOpeningResult>;
  resolveWorkItem(req: ResolveWorkItemRequest): Promise<ResolutionResult>;
}

// Scheduler boundary
interface Scheduler {
  scanForRunnableWork(scopeId?: string, limit?: number): WorkItem[];
  acquireLease(workItemId: string, runnerId: string): LeaseAcquisitionResult;
  startExecution(workItemId: string, revisionId: string, envelopeJson: string): ExecutionAttempt;
  completeExecution(executionId: string, outcomeJson: string): void;
  failExecution(executionId: string, error: string, releaseLease: boolean): void;
}

// Charter runtime boundary
interface CharterRunner {
  run(envelope: CharterInvocationEnvelope): Promise<CharterOutputEnvelope>;
}

// Coordinator store boundary
interface CoordinatorStore {
  insertWorkItem(item: WorkItem): void;
  getWorkItem(id: string): WorkItem | undefined;
  insertExecutionAttempt(attempt: ExecutionAttempt): void;
  // ... (see src/coordinator/types.ts for full schema)
}

// Outbound store boundary
interface OutboundStore {
  insertCommand(command: OutboundCommand): void;
  insertVersion(version: OutboundVersion): void;
  getLatestVersion(commandId: string): OutboundVersion | undefined;
}
```

### Projector Dependencies (`src/projector/apply-event.ts`)

The `applyEvent` function depends on these abstractions:

```typescript
interface ApplyEventDeps {
  blobs: BlobInstaller;           // Content-addressed storage
  messages: MessageStore;         // Canonical message state
  tombstones: TombstoneStore;     // Deletion markers
  views: ViewDirtyMarker;         // Derived view invalidation
  tombstones_enabled: boolean;    // Feature flag
}
```

---

## Module Dependencies

```
src/
├── cli/
│   └── depends on: runner, persistence, config
├── runner/
│   └── depends on: adapter, persistence, projector, types
├── adapter/graph/
│   └── depends on: types/graph, types/normalized, normalize/*
├── normalize/
│   └── depends on: types/normalized, types/graph, ids/event-id
├── persistence/
│   └── depends on: types/normalized, types/runtime
├── projector/
│   └── depends on: types/normalized, types/runtime
├── ids/
│   └── depends on: types/normalized
├── config/
│   └── depends on: adapter/graph/auth
├── coordinator/
│   └── depends on: types
├── foreman/
│   └── depends on: coordinator, outbound, types
├── scheduler/
│   └── depends on: coordinator, types
├── charter/
│   └── depends on: coordinator, persistence, types
├── outbound/
│   └── depends on: types
└── types/
    └── (no internal dependencies - leaf module)
```

---

## Key Design Decisions

### 1. Adapter Pattern for Persistence

All persistence stores implement interfaces from `types/runtime.ts`. This allows:
- Testing with in-memory implementations
- Future database backends without changing runner logic
- Clear separation between storage mechanism and business logic

### 2. Dependency Injection via Constructor

Components receive dependencies through constructors/options objects:

```typescript
const runner = new DefaultSyncRunner({
  rootDir,
  adapter,
  cursorStore,
  applyLogStore,
  projector,
});
```

This enables:
- Easy mocking in tests
- Composable architecture
- Clear dependency graphs

### 3. Event-Driven Normalization

Graph API responses are immediately normalized to `NormalizedEvent` with deterministic IDs. This ensures:
- Replay safety (same Graph response = same event ID)
- Decoupling from Graph API shape changes
- Local processing without external dependencies

### 4. Two-Phase View Updates

Views are updated during event application but marked as "dirty" rather than fully recomputed:

```typescript
interface ApplyEventResult {
  dirty_views: {
    by_thread: string[];
    by_folder: string[];
    unread_changed: boolean;
    flagged_changed: boolean;
  };
}
```

Full view rebuilds can happen asynchronously or on demand.

---

## Concurrency Model

### Single-Writer Guarantee

```
┌─────────────────────────────────────────────────────────────┐
│                    Sync Cycle                               │
│                                                             │
│  1. acquireLock() ──▶ exclusive filesystem lock             │
│                                                             │
│  2. fetch_since() ──▶ read-only operation                   │
│                                                             │
│  3. for each event:                                         │
│     - hasApplied() ──▶ read-only                            │
│     - applyEvent() ──▶ write to messages/                   │
│     - markApplied() ──▶ write to apply-log/                 │
│                                                             │
│  4. cursor.commit() ──▶ atomic cursor update                │
│                                                             │
│  5. releaseLock() ──▶ end exclusive access                  │
└─────────────────────────────────────────────────────────────┘
```

The `FileLock` implementation uses a directory-based lock with:
- Stale lock detection (5 minute default timeout)
- Retry with exponential backoff
- Configurable acquisition timeout

---

## Error Handling Strategy

### Layer-Specific Behavior

| Layer | Error Handling |
|-------|----------------|
| Adapter | HTTP errors → retryable_failure; malformed JSON → fatal_failure |
| Normalization | Validation errors → throw (indicates Graph API change) |
| Persistence | Filesystem errors → propagate (I/O issues) |
| Projector | Apply errors → propagate (invalid state) |
| Runner | Catches all, returns RunResult with status |

### Runner Error Classification

```typescript
interface RunResult {
  status: "success" | "retryable_failure" | "fatal_failure";
  error?: string;
  // ... other fields
}
```

- **success**: All events applied, cursor committed
- **retryable_failure**: Transient error (network, lock timeout), safe to retry
- **fatal_failure**: Configuration or data error, requires investigation

---

## Authority Boundaries

These boundaries are enforced by code structure and must not be bypassed:

1. **Foreman owns work opening**: Only `DefaultForemanFacade.onSyncCompleted()` (or `onFactsAdmitted()`) may insert `work_item` rows.
2. **Foreman owns resolution**: Only `DefaultForemanFacade.resolveWorkItem()` may transition a `work_item` to a terminal status based on charter output.
3. **Foreman owns failure classification**: Only `DefaultForemanFacade.failWorkItem()` may transition a `work_item` to `failed_retryable` or `failed_terminal`.
4. **Scheduler owns leases and mechanical execution lifecycle**: Only `SqliteScheduler` may insert/release `work_item_leases` and transition a work item into `leased` or `executing`. The scheduler marks execution attempts crashed and releases leases, but does not semantically classify work-item failure status.
5. **OutboundHandoff owns command creation**: All `outbound_commands` + `outbound_versions` must be created inside `OutboundHandoff.createCommandFromDecision()` (atomic with decision insert).
6. **Outbound workers own mutation**: Only the outbound worker layer may call Graph API to create drafts / send messages / move items.
7. **Charter runtime is read-only sandbox**: It may only read the `CharterInvocationEnvelope` and produce a `CharterOutputEnvelope`. It must NOT write to coordinator or outbound stores directly.
8. **Audited operator control**: The operator console may mutate work items only through `executeOperatorAction()` with safelisted actions. Every action is logged to `operator_action_requests`.

## Re-Derivation and Recovery Operators

The architecture supports a family of explicit operators for bounded recomputation between durable boundaries (defined canonically in [`SEMANTICS.md`](../../../../SEMANTICS.md) §2.8 and formalized in [`00-kernel.md`](00-kernel.md) §8). Key architectural commitments:

- **Same-path replay**: Replay derivation (`Fact` → `Work`) routes through the same `ContextFormationStrategy` and `ForemanFacade.onContextsAdmitted()` as live dispatch. No parallel work-opening algorithm exists.
- **Live admission is compound**: Live dispatch performs a fact lifecycle transition (`unadmitted` → `admitted`) plus work opening. Replay is pure work opening with no fact lifecycle side effect.
- **Preview stops before mutation**: Preview derivation (`Fact` → `Evaluation`) runs context formation and charter evaluation but does not invoke `onContextsAdmitted()`, `acquireLease()`, or `IntentHandoff`.
- **Rebuild is non-authoritative**: Projection rebuild (`Durable state` → `Observation`) may write to derived stores (search index, read models) but must never write to canonical durable boundaries (`facts`, `work_items`, `intents`, `decisions`).
- **Confirm does not re-execute**: Confirmation replay (`Execution` → `Confirmation`) queries external state through reconciliation logic; it does not resubmit commands or re-execute effects.
- **No automatic replay on startup**: All non-live operators require explicit operator trigger. The daemon dispatch loop does not silently recover, rebuild, or replay on startup.

---

## Advisory Signals in Runtime Architecture

Advisory signals (defined canonically in [`SEMANTICS.md`](../../../../SEMANTICS.md) §2.12) flow through the architecture as **non-authoritative hints**. They influence operational choices without mutating durable state or overriding authority invariants.

### Implemented vs. Prospective

Only **`continuation_affinity`** is concretely implemented in the runtime today. The scheduler computes it from recent lease history and context revision timestamps, and the foreman carries it forward on work-item supersession. All other signals listed below are **design slots** — prospective family members that the architecture accommodates but does not yet emit or consume.

### Producers (Implemented + Prospective)

| Component | Signal | Status | Mechanism |
|-----------|--------|--------|-----------|
| **Scheduler** | `continuation_affinity` | **Implemented (v1)** | Stored on `WorkItem` at open time by the foreman. Affects `scanForRunnableWork()` ordering only. Session-targeted lease acquisition and runner selection are deferred to v2. |
| **Charter Runtime** | `low_confidence_proposal`, `high_confidence_repetitive`, `likely_needs_human_attention`, `unusually_risky` | Prospective | Would be emitted as fields in `CharterOutputEnvelope` (e.g., `confidence`, `escalations`) |
| **Tool Runner** | `tool_state_affinity`, `expensive_lane_avoidable` | Prospective | Would be computed from tool catalog metadata and recent execution latency/cost |
| **Observation Plane** | `likely_policy_sensitive`, `heightened_scrutiny` | Prospective | Would be derived from pattern matching over historical decisions and overrides |
| **Operator Console** | `same_lane_review`, `cross_lane_review`, `independence_preferred` | Prospective | Would be configured by operator posture or inferred from escalation history |

### Consumers (Implemented + Prospective)

| Component | Signal | Status | Effect |
|-----------|--------|--------|--------|
| **Scheduler** | `continuation_affinity` | **Implemented (v1)** | May affect runnable-work ordering. The lease record remains the authoritative commitment. Session-targeted assignment is deferred to v2. |
| **Scheduler** | `tool_state_affinity`, `urgency_preference` | Prospective | Would affect lease assignment ordering or runner selection. The lease record would remain authoritative. |
| **Foreman** | `low_confidence_proposal`, `heightened_scrutiny` | Prospective | Would influence governance outcome (e.g., bias toward `escalate` when confidence is low). The `foreman_decision` row would remain authoritative. |
| **Worker Registry** | `cost_preference`, `trust_preference` | Prospective | Would affect worker prioritization or lane selection. The intent claim and execution record would remain authoritative. |
| **Operator Console** | `likely_needs_human_attention`, `unusually_risky` | Prospective | Would sort, filter, or highlight work items. Operator actions would still route through `executeOperatorAction()` with safelisted mutations. |

### Interaction with Scheduler / Foreman / Operator Surfaces

Advisory signals cross layer boundaries **as read-only data**, never as commands:

- **Scheduler → Foreman**: The scheduler does not send signals to the foreman. It sends leases and execution attempts. Any signal the foreman needs is recomputed from the evaluation envelope or durable state.
- **Foreman → Scheduler**: The foreman does not send signals to the scheduler. It resolves work items to terminal status. The scheduler discovers status changes on its next scan.
- **Charter → Foreman**: The charter produces an output envelope that *may contain* advisory signals (confidence, escalations). The foreman consumes them during governance but is not bound by them.
- **Observation → Operator**: The observation plane may render advisory signals as UI annotations (badges, sort keys, filters). These are decorative or derived, never authoritative.

### Architectural Invariants

1. **Signal Storage Is Optional**: Advisory signals may be ephemeral, cached, or logged. No canonical durable boundary depends on them.
2. **Signal Absence Is Safe**: Every consumer must have a sensible default when a signal is absent, contradictory, or stale.
3. **No Lifecycle Side Effect**: Consuming an advisory signal must not transition a durable object (fact, work item, intent, execution) into a new lifecycle state.
4. **No Authority Bypass**: An advisory signal must never be used to justify bypassing an authority boundary (e.g., a "trust" signal cannot allow a worker to skip intent claiming).

---

## See Also

- [00-kernel.md](00-kernel.md) — The irreducible, vertical-agnostic kernel lawbook
- [01-spec.md](01-spec.md) — Mailbox-vertical theoretical foundation
- [03-persistence.md](03-persistence.md) — Details on atomic writes and storage
- [07-graph-adapter.md](07-graph-adapter.md) — Graph API integration specifics
- [05-testing.md](05-testing.md) — How we verify these architectural properties
