# Identity and Determinism

## Overview

The system relies heavily on deterministic identity computation. Every event has a stable ID derived from its content, enabling idempotent processing and replay safety. This document describes the identity schemes and serialization rules.

---

## Event Identity

### Event ID Format

```
evt_<64-hexadecimal-characters>
```

Example: `evt_a3f5c8d2e1b9047...` (66 chars total)

### Computation

```typescript
function buildEventId(input: {
  mailbox_id: MailboxId;
  message_id: MessageId;
  event_kind: "upsert" | "delete";
  source_version?: SourceVersion;  // Graph changeKey
  payload?: NormalizedPayload;     // For upserts
}): EventId {
  const base = {
    mailbox_id: input.mailbox_id,
    message_id: input.message_id,
    event_kind: input.event_kind,
  };

  if (input.event_kind === "upsert") {
    // Prefer Graph changeKey for efficiency
    if (input.source_version) {
      base.source_version = input.source_version;
    } else if (input.payload) {
      // Fallback: hash the normalized payload
      base.payload_hash = hashNormalizedPayload(input.payload);
    } else {
      throw new Error("upsert event requires source_version or payload");
    }
  }

  if (input.event_kind === "delete") {
    base.source_version = input.source_version ?? null;
  }

  const material = stableStringify(base);
  const digest = sha256(material);
  return `evt_${digest}`;
}
```

### Identity Rules

| Event Type | Identity Source | Rationale |
|------------|-----------------|-----------|
| **Upsert** with `changeKey` | `source_version` (changeKey) | Graph provides version, efficient |
| **Upsert** without `changeKey` | Payload hash | Content-based identity |
| **Delete** | `message_id` + optional `source_version` | No payload to hash |

### Properties

1. **Determinism**: Same inputs → same event_id
2. **Uniqueness**: Different inputs → different event_id (SHA256 collision resistance)
3. **Stability**: Event ID doesn't change when replayed
4. **Verifiability**: Can recompute and verify

---

## Stable Serialization

### The Problem

JavaScript objects have no guaranteed key order:

```javascript
JSON.stringify({b: 1, a: 2})  // Could be '{"b":1,"a":2}' or '{"a":2,"b":1}'
```

This breaks hashing across different runtimes or JSON parsers.

### Solution: stableStringify

```typescript
function stableStringify(value: unknown): string {
  // Primitives: use JSON.stringify
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  // Arrays: recursively stringify elements
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  // Objects: sort keys alphabetically
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();  // ← Critical: sorted keys

  const entries = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`
  );

  return `{${entries.join(",")}}`;
}
```

### Guarantees

- Keys sorted lexicographically (Unicode code points)
- Arrays preserve order (not sorted)
- Nested objects recursively sorted
- Consistent output across all JavaScript engines

### Example

```javascript
const data = {
  zebra: "last",
  apple: {
    zebra: "nested",
    apple: "nested"
  },
  list: [3, 1, 2]
};

stableStringify(data);
// '{"apple":{"apple":"nested","zebra":"nested"},"list":[3,1,2],"zebra":"last"}'
//       ↑ nested keys sorted          ↑ array order preserved
```

---

## Content Hashing

### Payload Hash

When `source_version` is unavailable, the payload content is hashed:

```typescript
function hashNormalizedPayload(payload: NormalizedPayload): string {
  const stable = stableStringify(payload);
  return sha256(stable);
}
```

This creates a content-addressed identifier that:
- Changes when any field changes
- Is stable across serializations
- Can detect duplicate content

### Blob Hashing

Attachments are stored by content hash:

```typescript
function sha256HexBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
```

**Storage Layout**:
```
blobs/sha256/{first-2-chars}/{next-2-chars}/{full-64-char-hash}
```

Example: Hash `a3f5c8d2...` → `blobs/sha256/a3/f5/a3f5c8d2...`

---

## Message Identity

### Message ID Source

Message IDs come from the Graph API:

```typescript
function resolveMessageId(graphMessage: GraphDeltaMessage): string {
  const id = graphMessage.id?.trim();
  if (!id) {
    throw new Error("Graph delta entry is missing id");
  }
  return id;
}
```

### Immutable IDs

The Graph API supports immutable IDs via header:

```
Prefer: IdType="ImmutableId"
```

This ensures:
- Message ID doesn't change when moved between folders
- Stable identity across the mailbox lifetime
- Required for reliable sync

The `DefaultGraphAdapter` always requests immutable IDs.

---

## Identity in Apply-Log

### Marker File

Each applied event creates a marker file:

```typescript
interface ApplyMarkerFileShape {
  event_id: string;   // The computed event ID
  message_id: string;
  event_kind: "upsert" | "delete";
  applied_at: string; // ISO timestamp
}
```

**Storage**:
```
state/apply-log/{event_id.slice(0,2)}/{event_id}.json
```

Example: `evt_a3f5c8d2...` → `state/apply-log/a3/evt_a3f5c8d2....json`

### Sharding Rationale

SHA256 produces uniform distribution:
- First 2 chars: 256 possible values (00-ff)
- Prevents any single directory from growing too large
- Even distribution across shards

---

## Determinism Guarantees

### For Normalization

Given the same Graph delta entry, `normalizeDeltaEntry()` produces:
- Same `event_id`
- Same `payload` (for upserts)
- Same all fields

### For Event Ordering

Within a batch, events are:
1. Processed in Graph API order initially
2. Deduplicated by `event_id` (Map-based)
3. Sorted by `event_id` (lexicographic)

```typescript
function dedupeEventsById(events: NormalizedEvent[]): NormalizedEvent[] {
  const byId = new Map<string, NormalizedEvent>();
  for (const event of events) {
    byId.set(event.event_id, event);  // Last wins for duplicates
  }
  return [...byId.values()].sort((a, b) => 
    a.event_id.localeCompare(b.event_id)
  );
}
```

### For Replay

Replaying the same events produces identical state:

```
replay(E, S0) ⇒ S*
replay(E, S*) ⇒ S*  (idempotent)
```

---

## Validation

### Event ID Validation

```typescript
function isValidEventId(id: string): boolean {
  return (
    id.startsWith("evt_") &&
    id.length === 66 &&  // "evt_" + 64 hex chars
    /^evt_[0-9a-f]{64}$/.test(id)
  );
}
```

### Content Reference Validation

```typescript
function isValidContentRef(ref: string): boolean {
  return (
    ref.startsWith("blob:sha256:") ||
    ref.startsWith("inline-base64:")
  );
}
```

---

## Collision Considerations

### SHA256 Collision Probability

For SHA256:
- 2^256 possible hashes
- Birthday bound: ~2^128 operations to find collision
- Practically impossible to collide intentionally

### System Behavior on Collision

If two different events somehow produced the same `event_id`:

1. First event applied, marker written
2. Second event: `hasApplied()` returns true
3. Second event skipped

**Impact**: Second change would be lost. This requires a SHA256 collision, which is cryptographically infeasible.

---

## Testing Identity

### Unit Test Pattern

```typescript
describe("event-id", () => {
  it("produces same id for same input", () => {
    const input = { mailbox_id: "m", message_id: "msg", ... };
    const id1 = buildEventId(input);
    const id2 = buildEventId(input);
    expect(id1).toBe(id2);
  });

  it("produces different id for different input", () => {
    const id1 = buildEventId({ message_id: "msg1", ... });
    const id2 = buildEventId({ message_id: "msg2", ... });
    expect(id1).not.toBe(id2);
  });
});
```

### Stability Test

```typescript
it("stableStringify produces consistent output", () => {
  const obj = { z: 1, a: 2, nested: { z: 3, a: 4 } };
  const str = stableStringify(obj);
  
  // Must be identical regardless of input key order
  expect(str).toBe('{"a":2,"nested":{"a":4,"z":3},"z":1}');
});
```

---

## See Also

- [01-spec.md](01-spec.md) — Section 1.3: Event Identity formal definition
- [02-architecture.md](02-architecture.md) — Where identity fits in data flow
- [03-persistence.md](03-persistence.md) — How identities are stored in apply-log
- [05-testing.md](05-testing.md) — Testing identity and determinism
