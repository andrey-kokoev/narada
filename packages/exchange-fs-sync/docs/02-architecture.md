# Architecture

## Component Overview

The system is organized into six layers, each with clear responsibilities and interface boundaries:

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
