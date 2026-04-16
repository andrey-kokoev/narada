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
│  (command claim, draft creation, send, reconcile to confirmed)  │
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

### Vocabulary Note

- **`conversation_id`** is the v2 canonical thread identifier.
- **`thread_id`** is legacy-only. It remains in `thread_records` for rollback safety and in some internal variable names, but all control-plane tables (`conversation_records`, `work_items`, `outbound_commands`) use `conversation_id`.

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
│  exchange-fs-sync │  ← Deterministic compiler
│  (sync cycle)     │     Normalizes events, applies to filesystem,
│                   │     updates views, commits cursor
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Daemon           │  ← Emits SyncCompletionSignal
│  (dispatch phase) │     { changed_conversations: [...] }
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
│  (mail / process) │     (draft+send for mail, subprocess for process)
└─────────┬─────────┘
          │
          ▼
TERMINAL QUIESCENCE
        │
        ▼
Daemon sleeps until next wake (webhook, poll, retry timer, manual)
```

### Step Descriptions

1. **Remote Source Change** — Graph API (mailbox vertical) or timer tick reports a change.
2. **Sync / Ingest** — The compiler fetches deltas (or the timer emits a fact), normalizes to `Fact` records, applies to the local projection (e.g. `messages/` and `views/`), writes `apply-log` markers, and commits the cursor.
3. **Work Opening** — The daemon calls `foreman.onSyncCompleted(signal)`. The foreman inserts `work_item` rows for changed contexts, superseding stale ones when necessary.
4. **Scheduling** — The scheduler scans for runnable work items, acquires leases, and transitions items to `leased`.
5. **Evaluation** — The scheduler inserts an `execution_attempt` and transitions the item to `executing`. The charter runtime receives a frozen `CharterInvocationEnvelope` and produces a `CharterOutputEnvelope`.
6. **Tool Execution** — Approved *read-only* tool requests are executed by the tool runner, with results logged to `tool_call_records`. Non-read-only requests are rejected with `rejected_policy` records (Phase A guardrail).
7. **Proposal / Intent Creation** — The foreman validates output (`validation.ts`), applies governance (`governance.ts`), writes a `foreman_decisions` row, and creates an `intent` in the same SQLite transaction. The work item transitions to `resolved`.
8. **Worker Execution** — The appropriate worker claims the intent and executes the effect: outbound worker creates drafts/sends for `mail.*` intents; `ProcessExecutor` spawns a subprocess for `process.run` intents.
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

1. **Foreman owns work opening**: Only `DefaultForemanFacade.onSyncCompleted()` may insert `work_item` rows.
2. **Foreman owns resolution**: Only `DefaultForemanFacade.resolveWorkItem()` may transition a `work_item` to a terminal status based on charter output.
3. **Scheduler owns leases**: Only `SqliteScheduler` may insert/release `work_item_leases` and transition `work_item` between `opened ↔ leased ↔ executing ↔ failed_retryable`.
4. **OutboundHandoff owns command creation**: All `outbound_commands` + `outbound_versions` must be created inside `OutboundHandoff.createCommandFromDecision()` (atomic with decision insert).
5. **Outbound workers own mutation**: Only the outbound worker layer may call Graph API to create drafts / send messages / move items.
6. **Charter runtime is read-only sandbox**: It may only read the `CharterInvocationEnvelope` and produce a `CharterOutputEnvelope`. It must NOT write to coordinator or outbound stores directly.

## See Also

- [00-kernel.md](00-kernel.md) — The irreducible, vertical-agnostic kernel lawbook
- [01-spec.md](01-spec.md) — Mailbox-vertical theoretical foundation
- [03-persistence.md](03-persistence.md) — Details on atomic writes and storage
- [07-graph-adapter.md](07-graph-adapter.md) — Graph API integration specifics
- [05-testing.md](05-testing.md) — How we verify these architectural properties
