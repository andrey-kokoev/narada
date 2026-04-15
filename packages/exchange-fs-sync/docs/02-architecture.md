# Architecture

## Component Overview

The system is organized into **eleven layers**: five control-plane layers above six deterministic compiler layers.

### Control Plane Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      Daemon Layer                                │
│  (wake coalescing, sync-to-dispatch sequence, quiescence)       │
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
REMOTE MAILBOX
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
│  (resolution)     │     writes foreman_decision + outbound_command
│                   │     (or resolves as no-op / escalation)
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Outbound Worker  │  ← Claims command, creates draft,
│  (mutation)       │     sends, reconciles to confirmed
└─────────┬─────────┘
          │
          ▼
TERMINAL QUIESCENCE
        │
        ▼
Daemon sleeps until next wake (webhook, poll, retry timer, manual)
```

### Step Descriptions

1. **Remote Mailbox Change** — Graph API reports a change.
2. **Sync** — The compiler fetches deltas, normalizes events, applies to `messages/` and `views/`, writes `apply-log` markers, and commits the cursor.
3. **Work Opening** — The daemon calls `foreman.onSyncCompleted(signal)`. The foreman inserts `work_item` rows for changed conversations, superseding stale ones when necessary.
4. **Scheduling** — The scheduler scans for runnable work items, acquires leases, and transitions items to `leased`.
5. **Evaluation** — The scheduler inserts an `execution_attempt` and transitions the item to `executing`. The charter runtime receives a frozen `CharterInvocationEnvelope` and produces a `CharterOutputEnvelope`.
6. **Tool Execution** — Approved tool requests are executed by the tool runner, with results logged to `tool_call_records`.
7. **Proposal / Command Creation** — The foreman validates output, writes a `foreman_decisions` row, and creates `outbound_command` + `outbound_versions` in the same SQLite transaction. The work item transitions to `resolved`.
8. **Outbound Execution** — The outbound worker polls commands, creates Graph drafts, and drives status to `confirmed`.
9. **Terminal Quiescence** — The scheduler finds no runnable work, valid leases, or expired retry timers. The daemon sleeps until the next wake.

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

## See Also

- [01-spec.md](01-spec.md) — The theoretical foundation this architecture implements
- [03-persistence.md](03-persistence.md) — Details on atomic writes and storage
- [07-graph-adapter.md](07-graph-adapter.md) — Graph API integration specifics
- [05-testing.md](05-testing.md) — How we verify these architectural properties
