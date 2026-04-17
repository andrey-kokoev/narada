# AGENTS.md — exchange-fs-sync package

> **Package Guide**: This file covers conventions specific to the `exchange-fs-sync` package. For the canonical kernel lawbook, see [`docs/00-kernel.md`](docs/00-kernel.md). For project overview and navigation, see the [root AGENTS.md](../../AGENTS.md).
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

## Control Plane Quick Reference

| File | Concept |
|------|---------|
| [`src/coordinator/store.ts`](src/coordinator/store.ts) | `SqliteCoordinatorStore` — durable state for conversations, work items, leases, execution attempts, evaluations, decisions, agent sessions, tool calls, policy overrides |
| [`src/coordinator/types.ts`](src/coordinator/types.ts) | `WorkItem`, `ExecutionAttempt`, `AgentSession`, `Evaluation`, `ToolCallRecord`, `ForemanDecisionRow` |
| [`src/scheduler/scheduler.ts`](src/scheduler/scheduler.ts) | `SqliteScheduler` — lease acquisition, execution lifecycle, stale-lease recovery |
| [`src/scheduler/types.ts`](src/scheduler/types.ts) | `Scheduler`, `LeaseAcquisitionResult` |
| [`src/foreman/facade.ts`](src/foreman/facade.ts) | `DefaultForemanFacade` — work opening, resolution, outbound handoff orchestration |
| [`src/foreman/types.ts`](src/foreman/types.ts) | `SyncCompletionSignal`, `ChangedContext`, `CharterOutputEnvelope`, `EvaluationEnvelope` |
| [`src/foreman/validation.ts`](src/foreman/validation.ts) | 10-rule validation of charter output against invocation envelope |
| [`src/foreman/governance.ts`](src/foreman/governance.ts) | `governEvaluation()` — policy enforcement, action bounding, confidence floors |
| [`src/foreman/handoff.ts`](src/foreman/handoff.ts) | `OutboundHandoff` — atomic decision → outbound command transaction |
| [`src/charter/index.ts`](src/charter/index.ts) | `CharterRunner`, `buildInvocationEnvelope`, `buildEvaluationRecord` |
| [`src/outbound/types.ts`](src/outbound/types.ts) | `OutboundCommand`, `OutboundVersion`, state machine transitions |
| [`src/outbound/store.ts`](src/outbound/store.ts) | `SqliteOutboundStore` — commands, versions, managed drafts |
| [`src/outbound/send-reply-worker.ts`](src/outbound/send-reply-worker.ts) | Draft creation, reuse, and send worker |
| [`src/outbound/non-send-worker.ts`](src/outbound/non-send-worker.ts) | Non-send action worker |
| [`src/outbound/reconciler.ts`](src/outbound/reconciler.ts) | `OutboundReconciler` — submitted → confirmed binding |
| [`src/config/types.ts`](src/config/types.ts) | `RuntimePolicy`, `ExchangeFsSyncConfig` |
| [`src/config/defaults.ts`](src/config/defaults.ts) | Default charter runtime (`mock`), default policy (`support_steward`) |

## Control Plane Architecture (v2)

The control plane sits above the deterministic inbound compiler and manages first-class work objects.

- **Integration Spec**: [`20260414-011-chief-integration-control-plane-v2.md`](../../.ai/tasks/20260414-011-chief-integration-control-plane-v2.md)
- **Coordinator Store**: [`src/coordinator/store.ts`](src/coordinator/store.ts)
- **Scheduler**: [`src/scheduler/scheduler.ts`](src/scheduler/scheduler.ts)
- **Foreman Facade**: [`src/foreman/facade.ts`](src/foreman/facade.ts)
- **Outbound Handoff**: [`src/foreman/handoff.ts`](src/foreman/handoff.ts)

Key principles:
- The compiler (`exchange-fs-sync`) determines source truth; the control plane decides what to do about it.
- `work_item` is the terminal generalized schedulable unit. It uses `context_id` (was `conversation_id`) and `scope_id` (was `mailbox_id`) so timer/process and future verticals can produce first-class work without mailbox semantics.
- Work opening derives from `PolicyContext` through a `ContextFormationStrategy` (e.g. `MailboxContextStrategy`, `TimerContextStrategy`).
- At most one non-terminal work item per context may be `leased` or `executing`.
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
      const cursorStore = new FileCursorStore({ rootDir, scopeId: "s1" });
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
├── tmp/                         # Atomic write staging
└── .narada/
    └── coordinator.db           # WAL-mode SQLite (control-plane durable state)
        ├── conversation_records
        ├── conversation_revisions
        ├── work_items
        ├── work_item_leases
        ├── execution_attempts
        ├── evaluations
        ├── foreman_decisions
        ├── agent_sessions
        ├── tool_call_records
        └── policy_overrides
```

**Important**: `tmp/` must be on same filesystem as other directories for atomic rename to work.

### Coordinator Database Setup

The daemon creates `{rootDir}/.narada/coordinator.db` lazily on first dispatch:

```typescript
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
```

- **Schema coexistence**: `SqliteCoordinatorStore` and `SqliteOutboundStore` share the same `Database` instance. Do not open separate connections to the same file while the daemon is running.
- **Rollback safety**: Legacy `thread_records` still exists in the schema for rollback, but all new control-plane features must anchor on `conversation_records`.
- **Authority boundary**: Do not write to `work_items`, `work_item_leases`, or `execution_attempts` from outside the foreman/scheduler.

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

## Observation Plane

The observation plane (`src/observability/`) provides **read-only, derived views** over durable kernel state.

- **Derived, not authoritative**: Observation values are computed from SQLite tables, not stored as control truth.
- **Reconstructible**: Any observation can be rebuilt from durable state alone; no terminal attachment or in-memory state is required.
- **Log-independent**: Rotating or deleting logs, traces, or ephemeral tables does not change observation accuracy.
- **No correctness coupling**: No scheduler, lease, executor, or sync correctness path may depend on observation artifacts.

### Key surfaces
- `ObservationPlane.snapshot()` — unified view of workers, control plane, process executions, and intents
- `getWorkerStatuses()` — worker registration + durable-state activity per executor family
- `getProcessExecutionSummaries()` — active, recent, and failed process executions
- `getIntentSummaries()` — pending, executing, and failed terminal intents
- `buildControlPlaneSnapshot()` — work items, execution attempts, tool calls, outbound commands

### Invariants
1. Observation reads may never write to durable stores.
2. Observation must remain accurate even if all logs and traces are dropped.
3. Operator visibility must not require terminal attachment.

### UI Authority Guardrails (Task 073)
The observation UI must remain a **projection** of durable state and must not become a hidden control plane.

| Guard | Enforcement |
|-------|-------------|
| **Read-mostly semantics** | `observation-server.ts` allows only `GET` (derived reads) and a single audited `POST /actions` endpoint. All other HTTP methods return `405`. |
| **No direct store mutations** | Route handlers receive `*View` store interfaces (`CoordinatorStoreView`, `IntentStoreView`, `OutboundStoreView`, `ProcessExecutionStoreView`). These types omit all write methods at compile time. |
| **No intent boundary bypass** | The UI cannot call `intentStore.admit()` or `intentStore.updateStatus()` — those methods are stripped from `IntentStoreView`. |
| **No scheduler/foreman bypass** | The UI cannot create work items, record leases, release leases, or inject foreman decisions. `CoordinatorStoreView` excludes `insertWorkItem`, `insertLease`, `releaseLease`, `insertDecision`, etc. |
| **Audited operator actions only** | The sole permitted write path is `executeOperatorAction()` in `operator-actions.ts`. Every action is validated, logged to `operator_action_requests`, and restricted to a safelisted set (`retry_work_item`, `acknowledge_alert`, `rebuild_views`, `request_redispatch`). |
| **Data-source transparency** | Every major snapshot includes `_meta.source_classifications` marking fields as `authoritative` (mirrors a durable row), `derived` (computed projection), or `decorative` (presentational only). |

### Contribution rule
> **If you are adding a UI-facing endpoint that writes to durable state, it must go through `operator-actions.ts` and use a `*View` store type. Direct store mutation from a route handler is prohibited.**

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

## Review Checklist for Future Architecture Changes

When proposing changes that touch public types, docs, or package surfaces, verify:

- [ ] **Kernel-first framing**: Docs and comments describe the generalized behavior first, vertical specifics second.
- [ ] **No mailbox-default types**: Generic interfaces use `scope_id` / `context_id`, not `mailbox_id` / `conversation_id`.
- [ ] **Vertical parity**: New features for one vertical have a plausible path for peers (timer, webhook, filesystem, process).
- [ ] **Authority boundaries preserved**: No new write paths bypass `ForemanFacade`, `Scheduler`, `IntentHandoff`, or `OutboundHandoff`.
- [ ] **Observation remains read-only**: No UI-facing code mutates durable state directly.
- [ ] **Kernel lint passes**: `pnpm kernel-lint` reports zero violations.

---

## Resources
- [Microsoft Graph Delta Query Docs](https://docs.microsoft.com/en-us/graph/delta-query-overview)
- [Node fs promises API](https://nodejs.org/api/fs.html#fs_promises_api)
- [Vitest Testing Framework](https://vitest.dev/)
