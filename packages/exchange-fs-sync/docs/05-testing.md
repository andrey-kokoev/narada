# Testing Strategy

## Overview

The test suite verifies correctness properties derived from the specification:
- Replay safety and idempotency
- Crash recovery at any point
- Deterministic event identity
- State convergence

---

## Test Organization

```
test/
├── integration/          # End-to-end correctness tests
│   ├── bootstrap.test.ts
│   ├── crash-replay.test.ts
│   ├── delete.test.ts
│   ├── replay.test.ts
│   └── update.test.ts
└── unit/                 # Component isolation tests
    ├── adapter/
    ├── config/
    ├── ids/
    └── normalize/
```

---

## Integration Tests

### Purpose

Integration tests verify system-level invariants using the real filesystem and in-memory adapters. They simulate scenarios that are difficult to test with real Graph API connections.

### Test Pattern

```typescript
describe("feature", () => {
  it("should maintain invariant after operation", async () => {
    // 1. Setup temp directory
    const rootDir = await mkdtemp(join(tmpdir(), "prefix-"));
    
    // 2. Create adapter mock
    const adapter: GraphAdapter = {
      fetch_since: async () => ({ ...batch }),
    };
    
    // 3. Instantiate real stores
    const cursorStore = new FileCursorStore({ rootDir, mailboxId: "m" });
```

---

## See Also

- [02-architecture.md](02-architecture.md) — Error handling strategy being tested
- [03-persistence.md](03-persistence.md) — Persistence layer tested here
- [08-quickstart.md](08-quickstart.md) — Running tests as verification
- [Package AGENTS.md](../AGENTS.md) — Testing conventions and debugging
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const messageStore = new FileMessageStore({ rootDir });
    
    // 4. Execute operation
    const runner = new DefaultSyncRunner({ ...deps });
    const result = await runner.syncOnce();
    
    // 5. Verify invariants
    expect(result.status).toBe("success");
    await expect(fileExists(expectedPath)).resolves.toBe(true);
  });
});
```

### Crash Replay Test (`crash-replay.test.ts`)

**Scenario**: System crashes after writing message state but before marking event applied.

```typescript
it("converges safely when crash happens after canonical apply", async () => {
  // First run: crash after apply, before mark_applied
  const crashingProjector = {
    applyEvent: async (event) => {
      const result = await applyEvent(deps, event);
      if (shouldCrash) {
        throw new Error("simulated crash after canonical apply");
      }
      return result;
    },
  };

  const first = await runner.syncOnce();
  expect(first.status).toBe("retryable_failure");
  
  // Verify: message written, but not in apply_log
  expect(await messageExists()).toBe(true);
  expect(await applyLogStore.hasApplied(eventId)).toBe(false);

  // Second run: normal completion
  const second = await runner.syncOnce();
  expect(second.status).toBe("success");
  
  // Verify: event reapplied (idempotent), now in apply_log
  expect(await applyLogStore.hasApplied(eventId)).toBe(true);
});
```

**Invariants Verified**:
- Message state survives crash
- Event is reapplied on recovery (idempotent)
- Final state is correct

### Replay Test (`replay.test.ts`)

**Scenario**: Same events fetched multiple times (delta token replay).

```typescript
it("skips already-applied events safely", async () => {
  const first = await runner.syncOnce();
  expect(first.applied_count).toBe(1);
  expect(first.skipped_count).toBe(0);

  const second = await runner.syncOnce();
  expect(second.applied_count).toBe(0);
  expect(second.skipped_count).toBe(1);
});
```

**Invariants Verified**:
- Events not double-applied
- Cursor advances correctly
- No state corruption

### Delete Test (`delete.test.ts`)

**Scenario**: Message deletion propagates correctly.

```typescript
// Setup: create message
await upsertMessage({ message_id: "msg-1", ... });

// Execute: delete event
await applyEvent(deps, deleteEvent);

// Verify: message removed
expect(await messageExists("msg-1")).toBe(false);
expect(await tombstoneExists("msg-1")).toBe(true);
```

### Update Test (`update.test.ts`)

**Scenario**: Message modification updates state atomically.

```typescript
// Setup: initial version
await upsertMessage({ message_id: "msg-1", subject: "v1" });

// Execute: update event
await applyEvent(deps, { ...upsertEvent, payload: { ...subject: "v2" } });

// Verify: only new version exists
const record = await readRecord("msg-1");
expect(record.subject).toBe("v2");
```

---

## Unit Tests

### Adapter Tests (`adapter/graph-adapter.test.ts`)

Test Graph API normalization without network calls:

```typescript
describe("normalizeDeltaEntry", () => {
  it("creates upsert event for new message", () => {
    const graphMessage = { id: "msg-1", subject: "Hello", ... };
    const event = normalizeDeltaEntry({ graph_message: graphMessage, ... });
    
    expect(event.event_kind).toBe("upsert");
    expect(event.payload.subject).toBe("Hello");
  });

  it("creates delete event for @removed message", () => {
    const graphMessage = { id: "msg-1", "@removed": { reason: "deleted" } };
    const event = normalizeDeltaEntry({ graph_message: graphMessage, ... });
    
    expect(event.event_kind).toBe("delete");
    expect(event.payload).toBeUndefined();
  });
});
```

### Identity Tests (`ids/event-id.test.ts`)

Verify deterministic identity computation:

```typescript
describe("buildEventId", () => {
  it("produces same id for identical inputs", () => {
    const input = { mailbox_id: "m", message_id: "msg", event_kind: "upsert", source_version: "v1" };
    const id1 = buildEventId(input);
    const id2 = buildEventId(input);
    expect(id1).toBe(id2);
  });

  it("includes payload hash when no source_version", () => {
    const input = { 
      mailbox_id: "m", 
      message_id: "msg", 
      event_kind: "upsert",
      payload: { subject: "Test" }
    };
    const id = buildEventId(input);
    expect(id).toMatch(/^evt_[0-9a-f]{64}$/);
  });
});
```

### Normalizer Tests (`normalize/*.test.ts`)

Test individual normalization functions:

```typescript
describe("normalizeAddresses", () => {
  it("extracts email and name", () => {
    const result = normalizeRecipient({
      emailAddress: { name: "John", address: "john@example.com" }
    });
    expect(result).toEqual({ name: "John", email: "john@example.com" });
  });

  it("handles missing emailAddress", () => {
    const result = normalizeRecipient(undefined);
    expect(result).toBeUndefined();
  });
});
```

### Config Tests (`config/*.test.ts`)

Test configuration loading and validation:

```typescript
describe("loadConfig", () => {
  it("loads valid config file", async () => {
    const config = await loadConfig({ path: "valid.json" });
    expect(config.mailbox_id).toBe("test");
  });

  it("throws on missing required field", async () => {
    await expect(loadConfig({ path: "invalid.json" }))
      .rejects.toThrow("mailbox_id must be a non-empty string");
  });
});
```

---

## Test Fixtures

### Batch Factory

```typescript
function makeBatch(nextCursor: string, events: Partial<NormalizedEvent>[]): NormalizedBatch {
  return {
    schema_version: SCHEMA_VERSION,
    mailbox_id: "mailbox_primary",
    adapter_scope: {
      mailbox_id: "mailbox_primary",
      included_container_refs: ["inbox"],
      included_item_kinds: ["message"],
      attachment_policy: "metadata_only",
      body_policy: "text_only",
    },
    prior_cursor: null,
    next_cursor: nextCursor,
    fetched_at: "2026-04-09T16:00:00Z",
    events: events.map(e => ({ ...defaultEvent, ...e })),
  };
}
```

### Mock Adapter

```typescript
function createMockAdapter(batches: NormalizedBatch[]): GraphAdapter {
  let callCount = 0;
  return {
    fetch_since: async () => {
      return batches[callCount++] ?? batches[batches.length - 1];
    },
  };
}
```

---

## Running Tests

### All Tests

```bash
pnpm test
```

### Watch Mode

```bash
pnpm test:watch
```

### Specific File

```bash
pnpm test -- test/unit/ids/event-id.test.ts
```

### With Coverage

```bash
pnpm test -- --coverage
```

---

## Debugging Integration Tests

### Inspecting Temp Directories

Add to test for debugging:

```typescript
console.log("Test directory:", rootDir);
// Leave directory for inspection
// (normally cleaned up by test framework)
```

### Verifying Filesystem State

```typescript
// List directory contents
const entries = await readdir(join(rootDir, "messages"));
console.log("Messages:", entries);

// Read specific file
const record = await readFile(
  join(rootDir, "messages", encodeURIComponent("msg-1"), "record.json"),
  "utf8"
);
console.log("Record:", JSON.parse(record));
```

---

## Writing New Tests

### Checklist

- [ ] Test name describes behavior, not implementation
- [ ] Uses temp directory, not real data directory
- [ ] Cleans up resources (use `finally` or test framework cleanup)
- [ ] Asserts on invariants, not specific values
- [ ] Covers success and failure paths
- [ ] Documents any non-obvious setup

### Template

```typescript
describe("Feature", () => {
  it("should maintain invariant when condition occurs", async () => {
    // Setup
    const rootDir = await mkdtemp(join(tmpdir(), "test-"));
    
    try {
      // Execute
      const result = await operation();
      
      // Verify
      expect(result.status).toBe("success");
      expect(await invariantHolds()).toBe(true);
    } finally {
      // Cleanup (optional - framework may handle)
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
```
