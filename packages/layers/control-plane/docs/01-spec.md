# Dearbitrized Specification

> This document specifies the **mailbox vertical**. For the generalized, vertical-agnostic kernel lawbook, see [`00-kernel.md`](00-kernel.md).

## 0. Objective

Construct a system that transforms a remote, mutable mailbox (Microsoft Graph / Exchange)
into a **deterministic, replay-safe, locally materialized state**.

The system must:

- tolerate crashes at any point
- tolerate re-fetching overlapping or identical data
- converge to a correct state without requiring coordination with the source
- make all correctness properties derivable from local state + committed cursor

---

## 1. Core Model

### 1.1 Domains

```
Remote Domain (Graph)
    ↓
Observed Changes (delta stream)
    ↓
Normalized Events
    ↓
Canonical Local State
    ↓
Derived Views
```

---

### 1.2 Entities

#### Message Identity

```
message_id := stable identifier (Graph id / immutable id)
```

Invariant:

```
∀ events e1, e2:
  if e1.message_id = e2.message_id
  then they refer to the same logical message
```

---

#### Event

```
Event =
  {
    event_id: deterministic identifier
    message_id
    event_kind ∈ {upsert, delete}
    source_version?   // Graph changeKey
    payload?          // for upsert
  }
```

---

#### Payload

```
Payload =
  canonical representation of message state
  independent of Graph shape
```

---

### 1.3 Event Identity

```
event_id := sha256(
  stable_stringify({
    mailbox_id,
    message_id,
    event_kind,
    source_version OR payload_hash
  })
)
```

Properties:

```
same semantic input → same event_id
different semantic input → different event_id
```

---

## 2. System State

### 2.1 Persistent State

```
cursor: last committed remote position

apply_log:
  set of event_id that have been applied

messages:
  canonical message state

tombstones:
  deletions (optional)

blobs:
  content-addressed artifacts

views:
  derived projections (non-authoritative)
```

---

### 2.2 State Partitioning

```
authoritative:
  cursor
  apply_log
  messages
  tombstones

non-authoritative:
  views

ephemeral:
  tmp
```

---

## 3. Transition Function

### 3.1 Sync Step

Given:

```
cursor_prev
```

Perform:

```
batch := fetch_since(cursor_prev)

for e in batch.events:
  if e.event_id ∉ apply_log:
    apply(e)
    mark_applied(e.event_id)

cursor := batch.next_cursor
```

---

### 3.2 Apply Function

#### Upsert

```
apply(upsert e):
  write payload → canonical message state
  remove tombstone if exists
```

#### Delete

```
apply(delete e):
  remove message state
  write tombstone (if enabled)
```

---

### 3.3 Apply Ordering

```
apply(e) MUST happen before mark_applied(e)
mark_applied(e) MUST happen before cursor commit
```

---

## 4. Invariants

### 4.1 No Loss After Commit

```
cursor = c
⇒ all events ≤ c have been applied
```

---

### 4.2 Replay Safety

```
apply(e) multiple times ⇒ same final state
```

---

### 4.3 Determinism

```
normalize(remote_data) is deterministic
```

---

### 4.4 Convergence

Let:

```
S0 = initial state
E = sequence of remote changes
```

Then:

```
replay(E, S0) ⇒ S*
replay(E, replay(E, S0)) ⇒ S*
```

---

### 4.5 Isolation of Derived State

```
views can be deleted and rebuilt from messages + tombstones
```

---

## 5. Failure Model

### 5.1 Crash Points

System may crash:

- before apply
- after apply but before mark_applied
- after mark_applied but before cursor commit

---

### 5.2 Recovery Behavior

#### Case A: crash before apply

```
event not applied
event_id ∉ apply_log
⇒ will be applied on replay
```

---

#### Case B: crash after apply, before mark_applied

```
state updated
event_id ∉ apply_log
⇒ event reapplied
⇒ must be idempotent
```

---

#### Case C: crash after mark_applied, before cursor commit

```
event_id ∈ apply_log
cursor not advanced
⇒ event skipped on replay
⇒ correctness preserved
```

---

## 6. Dearbitrized Constraints

### 6.1 No Implicit Deletes

```
absence of item ≠ delete
delete must be explicit event
```

---

### 6.2 No Hidden State

All correctness-relevant state must be in:

```
cursor
apply_log
messages
tombstones
```

---

### 6.3 No External Coordination

System correctness must not depend on:

- locks in remote system
- exactly-once delivery
- ordering guarantees from Graph

---

### 6.4 Idempotency Boundary

Idempotency is enforced at:

```
event_id → apply_log
```

---

### 6.5 Deterministic Serialization

All hashing inputs must use:

```
stable_stringify
```

No reliance on:

- object key order
- runtime-specific serialization

---

## 7. Minimal Completeness

System is complete if:

1. all remote changes eventually appear in normalized events
2. all normalized events are eventually applied
3. cursor advances only after durable application
4. replay produces identical state

---

## 8. Non-Goals

This system does NOT:

- provide real-time guarantees
- preserve full MIME fidelity
- support arbitrary mailbox-wide reconciliation (current scope)
- resolve semantic conflicts across domains
- perform transformation beyond normalization

---

## 9. Extension Axes (Constrained)

Extensions must preserve invariants.

Allowed directions:

```
+ richer payload (attachments, html)
+ stronger integrity checks
+ multi-folder support (explicit redesign required)
+ alternative projections (search index, analytics)
```

Disallowed without redesign:

```
- implicit deletes
- cursor-first commit
- non-deterministic normalization
- externalized apply-log
```

---

## 10. System Identity

The system is:

```
a deterministic, replayable state compiler
from remote mailbox deltas into local canonical state
```

Not:

```
a sync client
a cache
a mirror
a transport layer
```

---

## 11. Minimal Algebraic View

Let:

```
E = set of events
S = state
apply: S × E → S
```

Then:

### Idempotency

```
apply(apply(S, e), e) = apply(S, e)
```

---

### Commutativity (when independent)

```
if e1, e2 affect disjoint message_ids:

apply(apply(S, e1), e2) = apply(apply(S, e2), e1)
```

---

### Monotonic Progress

```
apply_log grows monotonically
cursor advances monotonically
```

---

### Fixed Point

```
∃ S* such that:
apply(S*, e) = S*  for all previously applied e
```

---

## 12. End Condition

System is correct if:

```
local canonical state ≡ projection(remote mailbox)
given all events up to committed cursor
```

and:

```
re-execution does not change state
```

---

## See Also

- [02-architecture.md](02-architecture.md) — How the specification is implemented in code
- [03-persistence.md](03-persistence.md) — Atomic writes and crash recovery mechanisms
- [04-identity.md](04-identity.md) — Event ID computation and stable serialization
