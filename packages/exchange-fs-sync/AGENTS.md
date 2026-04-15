# AGENTS.md — exchange-fs-sync package

> **Package Guide**: This file covers conventions specific to the `exchange-fs-sync` package. For project overview and navigation, see the [root AGENTS.md](../../AGENTS.md).
>
> **Control Plane Architecture**: For the integrated end-to-end control-plane v2 model, see [`20260414-011-chief-integration-control-plane-v2.md`](../../.ai/tasks/20260414-011-chief-integration-control-plane-v2.md).

---

## Package Structure

```
packages/exchange-fs-sync/
├── config.example.json          # Configuration template
├── docs/                        # Documentation
├── src/
│   ├── adapter/graph/           # Graph API integration
│   │   ├── adapter.ts           # Main adapter (DefaultGraphAdapter)
│   │   ├── auth.ts              # Token providers
│   │   ├── client.ts            # HTTP client
│   │   └── delta.ts             # Delta pagination
│   ├── cli/                     # CLI commands (DEPRECATED - use exchange-fs-sync-cli package)
│   │   ├── integrity-check.ts   # Integrity check command
│   │   ├── main.ts              # Entry point (basic implementation)
│   │   └── rebuild-views.ts     # View rebuild command
│   ├── config/                  # Configuration
│   │   ├── defaults.ts          # Default values
│   │   ├── env.ts               # Environment variable loading
│   │   ├── index.ts             # Re-exports
│   │   ├── load.ts              # Validation and loading
│   │   ├── token-provider.ts    # Token provider selection
│   │   └── types.ts             # Config TypeScript types
│   ├── coordinator/             # SQLite coordinator store (control-plane durable state)
│   │   ├── store.ts             # SqliteCoordinatorStore
│   │   ├── types.ts             # WorkItem, ExecutionAttempt, Lease types
│   │   └── thread-context.ts    # Thread context hydration
│   ├── foreman/                 # Control-plane foreman
│   │   ├── facade.ts            # DefaultForemanFacade
│   │   ├── handoff.ts           # Outbound handoff logic
│   │   └── types.ts             # Foreman types and envelopes
│   ├── ids/                     # Identity generation
│   │   └── event-id.ts          # buildEventId(), stableStringify()
│   ├── normalize/               # Graph → Normalized conversion
│   │   ├── addresses.ts         # Email address normalization
│   │   ├── attachments.ts       # Attachment handling
│   │   ├── batch.ts             # Batch normalization
│   │   ├── body.ts              # Body content normalization
│   │   ├── delta-entry.ts       # Single entry normalization
│   │   └── message.ts           # Full message normalization
│   ├── persistence/             # Filesystem storage
│   │   ├── apply-log.ts         # Event idempotency markers
│   │   ├── blobs.ts             # Content-addressed storage
│   │   ├── cursor.ts            # Delta token storage
│   │   ├── lock.ts              # Exclusive lock
│   │   ├── messages.ts          # Message state storage
│   │   ├── tombstones.ts        # Deletion markers
│   │   └── views.ts             # Derived projections
│   ├── projector/               # Event application
│   │   └── apply-event.ts       # applyEvent() function
│   ├── recovery/                # Crash recovery
│   │   └── cleanup-tmp.ts       # Temp file cleanup
│   ├── scheduler/               # Work-item scheduler and lease manager
│   │   ├── scheduler.ts         # SqliteScheduler
│   │   └── types.ts             # Scheduler interfaces
│   ├── outbound/                # Durable outbound command pipeline
│   │   ├── types.ts             # Outbound command types and state machine
│   │   ├── schema.sql           # SQLite schema for commands and drafts
│   │   ├── store.ts             # SqliteOutboundStore
│   │   ├── send-reply-worker.ts # Draft creation / send worker
│   │   ├── non-send-worker.ts   # Non-send action worker
│   │   └── reconciler.ts        # Submitted → confirmed reconciliation
│   ├── runner/                  # Sync orchestration
│   │   ├── sync-once.ts         # DefaultSyncRunner
│   │   └── multi-sync.ts        # Multi-mailbox orchestration
│   ├── types/                   # Type definitions
│   │   ├── graph.ts             # Graph API types
│   │   ├── index.ts             # Re-exports
│   │   ├── normalized.ts        # Normalized event/message types
│   │   └── runtime.ts           # Interface definitions
│   └── index.ts                 # Public exports (currently empty)
└── test/
    ├── integration/               # System-level tests
    │   ├── bootstrap.test.ts
    │   ├── crash-replay.test.ts
    │   ├── delete.test.ts
    │   ├── replay.test.ts
    │   ├── update.test.ts
    │   └── control-plane/         # Replay/recovery and control-plane tests
    │       └── replay-recovery.test.ts
    └── unit/                      # Component tests
        ├── adapter/
        ├── config/
        ├── coordinator/
        ├── foreman/
        ├── ids/
        ├── normalize/
        ├── outbound/
        └── scheduler/
```

---

## Control Plane Architecture (v2)

The control plane sits above the deterministic inbound compiler and manages first-class work objects.

- **Integration Spec**: [`20260414-011-chief-integration-control-plane-v2.md`](../../.ai/tasks/20260414-011-chief-integration-control-plane-v2.md)
- **Coordinator Store**: [`src/coordinator/store.ts`](src/coordinator/store.ts)
- **Scheduler**: [`src/scheduler/scheduler.ts`](src/scheduler/scheduler.ts)
- **Foreman Facade**: [`src/foreman/facade.ts`](src/foreman/facade.ts)
- **Outbound Handoff**: [`src/foreman/handoff.ts`](src/foreman/handoff.ts)

Key principles:
- The compiler (`exchange-fs-sync`) determines mailbox truth; the control plane decides what to do about it.
- `work_item` is the terminal schedulable unit per conversation.
- At most one non-terminal work item per conversation may be `leased` or `executing`.
- Charters run inside bounded `execution_attempt`s with frozen capability envelopes.
- Only the outbound worker may create or mutate managed drafts.
- Recovery must succeed using only `work_item`, `execution_attempt`, and `outbound_command` state.

## Outbound Architecture

A durable outbound command pipeline enforces a hard boundary between proposal and execution.

- **Types**: [`src/outbound/types.ts`](src/outbound/types.ts)
- **Schema**: [`src/outbound/schema.sql`](src/outbound/schema.sql)
- **Store**: [`src/outbound/store.ts`](src/outbound/store.ts)

Key principles:
- Draft-first delivery: no direct sends from the agent
- SQLite as the source of truth for commands and transitions
- Two-stage completion: `submitted` (Graph accepted) → `confirmed` (inbound reconciliation)
- Only the outbound worker may create or mutate managed drafts
- External modification of a managed draft is a hard failure

---

## Coding Conventions

### File Naming

- **Source files**: `kebab-case.ts`
- **Test files**: `{module}.test.ts` adjacent to source or in `test/{type}/`
- **Index files**: Re-export public API, keep internal details hidden

### TypeScript Strictness

```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true
}
```

**Rule**: Code must compile with zero errors and zero warnings.

### Import Style

```typescript
// Internal: use .js extension for ESM
import { buildEventId } from "../ids/event-id.js";

// Types: explicit type imports
import type { NormalizedEvent } from "../types/normalized.js";
```

### Error Handling Pattern

```typescript
// Check for ENOENT on optional reads
try {
  const data = await readFile(path, "utf8");
  return JSON.parse(data);
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") {
    return null; // Not found is valid
  }
  throw error; // Other errors propagate
}
```

### Async Cleanup

Always handle cleanup, even in error paths:

```typescript
const tmpPath = join(tmpDir, `file.${process.pid}.tmp`);
try {
  await writeFile(tmpPath, data);
  await rename(tmpPath, finalPath);
} catch (error) {
  await rm(tmpPath, { force: true }).catch(() => undefined);
  throw error;
}
```

---

## Testing Conventions

### Test File Location

| Type | Location |
|------|----------|
| Unit | `test/unit/{module}/{feature}.test.ts` |
| Integration | `test/integration/{scenario}.test.ts` |

### Integration Test Pattern

```typescript
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("feature", () => {
  it("should maintain invariant", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "test-prefix-"));
    
    try {
      // Test with real stores
      const cursorStore = new FileCursorStore({ rootDir, mailboxId: "m" });
      // ... test code
    } finally {
      // Cleanup (or leave for OS temp cleanup)
      await rm(rootDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
```

### Required Test Coverage

Every persistence store must have tests for:
1. Happy path (create, read, update)
2. Idempotency (same operation twice)
3. Error handling (ENOENT, permissions)

---

## Interface Contracts

### GraphAdapter

```typescript
interface GraphAdapter {
  fetch_since(cursor?: CursorToken | null): Promise<NormalizedBatch>;
}
```

**Contract**:
- Must return all changes since cursor
- Must provide new cursor for next fetch
- Must normalize to `NormalizedEvent` with deterministic IDs

### CursorStore

```typescript
interface CursorStore {
  read(): Promise<CursorToken | null>;
  commit(nextCursor: CursorToken): Promise<void>;
}
```

**Contract**:
- `read()` returns null if no cursor exists
- `commit()` is atomic (write to tmp, rename)
- Cursor must not be empty string

### ApplyLogStore

```typescript
interface ApplyLogStore {
  hasApplied(eventId: EventId): Promise<boolean>;
  markApplied(event: NormalizedEvent): Promise<void>;
}
```

**Contract**:
- `hasApplied()` is read-only
- `markApplied()` is idempotent (safe to call twice)
- Event ID must be valid format (`evt_<64-hex>`)

---

## Filesystem Layout (Runtime)

When running, the system creates:

```
{root_dir}/
├── state/
│   ├── cursor.json              # Last committed position
│   ├── apply-log/               # Event markers (sharded)
│   └── sync.lock/               # Lock directory when running
├── messages/                    # Canonical message state
├── tombstones/                  # Deletion records (optional)
├── views/                       # Symlink projections
├── blobs/sha256/                # Content-addressed attachments
└── tmp/                         # Atomic write staging
```

**Important**: `tmp/` must be on same filesystem as other directories for atomic rename to work.

---

## Debugging Tips

### Enable Verbose Logging

The system uses structured logging. See `src/logging/types.ts` and `src/logging/structured.ts` for the interface.

```typescript
// In runner/sync-once.ts
console.log("[sync] Fetching since cursor:", priorCursor);
console.log("[sync] Got batch with", batch.events.length, "events");
```

### Inspect State Files

```bash
# Check current cursor
cat data/state/cursor.json | jq .

# List applied events
find data/state/apply-log -name "*.json" | wc -l

# Check a specific message
cat data/messages/$(printf '%s' 'message-id' | jq -sRr @uri)/record.json | jq .

# Verify views
ls -la data/views/by-thread/
```

### Simulate Crash

For testing crash recovery:

```typescript
// In test: throw after apply, before mark_applied
const crashingProjector = {
  applyEvent: async (event) => {
    const result = await applyEvent(deps, event);
    throw new Error("simulated crash");
  },
};
```

---

## Common Pitfalls

### 1. Forgetting URL Encoding

Message IDs may contain special characters. Always encode:

```typescript
// Wrong
const path = join(messagesDir, messageId);

// Right
const path = join(messagesDir, encodeURIComponent(messageId));
```

### 2. Assuming Cursor Progress

Cursor may not advance if no changes exist. Don't assume:

```typescript
// Wrong
expect(nextCursor).not.toBe(priorCursor);

// Right
expect(nextCursor).toBeDefined();
```

### 3. Mutable IDs

Without `Prefer: IdType="ImmutableId"`, message IDs change when moved between folders. Always use immutable IDs in production.

### 4. Cross-Filesystem Rename

Atomic rename requires source and destination on same filesystem. Don't put `tmp/` on a different mount.

---

## Extension Points

### Adding a New Normalizer

1. Create `src/normalize/{domain}.ts`
2. Export function that takes Graph type, returns normalized type
3. Must be deterministic (same input → same output)
4. Add tests in `test/unit/normalize/{domain}.test.ts`

### Adding a New Store

1. Define interface in `src/types/runtime.ts` (if new concept)
2. Implement in `src/persistence/{name}.ts`
3. Follow atomic write pattern
4. Handle ENOENT for optional reads
5. Add unit tests

### Adding a New View

1. Add method to `FileViewStore`
2. Update `ApplyEventResult.dirty_views` if incremental
3. Add to `rebuildAll()` for full rebuild
4. Views are non-authoritative—can be deleted and rebuilt

---

## Trace System

Traces are **commentary, not authority**.

- The canonical anchor for every trace is `execution_id`.
- Secondary references (`conversation_id`, `work_item_id`, `session_id`, `reference_outbound_id`) exist only for navigation and diagnostics.
- Traces may aid humans and debugging, but they must never alter control flow, scheduler decisions, lease state, outbound idempotency, or replay correctness.
- Deleting or corrupting traces must not affect any control-plane operation.
- Trace reads are best-effort; missing traces are not a failure mode.

### What traces are
- Runtime observations
- Tool call commentary
- Decision explanations
- Handoff notes
- Debug evidence

### What traces are not
- Source of truth for work resolution
- Source of truth for outbound idempotency
- Lease state
- Replay cursor
- Scheduler truth

---

## Toolchain

| Tool | Purpose |
|------|---------|
| **TypeScript (`tsc`)** | Compilation to ESM |
| **Vitest** | Test runner |
| **tsx** | TypeScript script execution |

### Commands

```bash
# Development
pnpm build            # tsc production build

# Quality checks
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest
pnpm benchmark        # Benchmark suite
pnpm benchmark:compare # Compare with baseline
```

---

## Resources
- [Microsoft Graph Delta Query Docs](https://docs.microsoft.com/en-us/graph/delta-query-overview)
- [Node fs promises API](https://nodejs.org/api/fs.html#fs_promises_api)
- [Vitest Testing Framework](https://vitest.dev/)
