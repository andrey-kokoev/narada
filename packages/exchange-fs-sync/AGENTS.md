# AGENTS.md — exchange-fs-sync package

> **Package Guide**: This file covers conventions specific to the `exchange-fs-sync` package. For project overview and navigation, see the [root AGENTS.md](../../AGENTS.md).

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
│   ├── cli/                     # CLI commands (currently sparse)
│   │   ├── integrity-check.ts
│   │   ├── main.ts              # Entry point (not yet implemented)
│   │   └── rebuild-views.ts
│   ├── config/                  # Configuration
│   │   ├── defaults.ts          # Default values
│   │   ├── env.ts               # Environment variable loading
│   │   ├── index.ts             # Re-exports
│   │   ├── load.ts              # Validation and loading
│   │   ├── token-provider.ts    # Token provider selection
│   │   └── types.ts             # Config TypeScript types
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
│   ├── runner/                  # Sync orchestration
│   │   └── sync-once.ts         # DefaultSyncRunner
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
    │   └── update.test.ts
    └── unit/                      # Component tests
        ├── adapter/
        ├── config/
        ├── ids/
        └── normalize/
```

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

The system doesn't have structured logging yet. Add temporarily:

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

## Resources

- [Microsoft Graph Delta Query Docs](https://docs.microsoft.com/en-us/graph/delta-query-overview)
- [Node fs promises API](https://nodejs.org/api/fs.html#fs_promises_api)
- [Vitest Testing Framework](https://vitest.dev/)
