# Outbound Idempotency and Effect-of-Once Boundary

## Context

Tasks 024–028 establish:

- deterministic crash/replay behavior
- explicit runtime correctness
- unified identity model
- non-authoritative trace system
- mailbox policy–driven routing

The system now makes real decisions and produces outbound commands.

What is still missing is a formally enforced **effect-of-once boundary** for outbound side effects.

Right now, correctness relies on:
- scheduler discipline
- execution_attempt semantics
- “should not duplicate” assumptions

This is insufficient.

## Goal

Guarantee that:

> each logical outbound intent results in at most one externally visible side effect,
> regardless of retries, crashes, or replay.

This must be enforced structurally, not by convention.

---

## Problem

Failure scenarios currently allow:

- duplicate outbound commands after crash/retry
- duplicate tool side effects if execution resumes ambiguously
- inconsistent linkage between decision and side effect

There is no explicit idempotency boundary tied to outbound intent.

---

## Required Work

### 1. Define Idempotency Key for Outbound Intent

Introduce a deterministic idempotency key:

- derived from:
  - canonical identity (from Task 026)
  - action type
  - normalized payload (canonicalized)

Example inputs:
- thread_id / conversation_id (chosen canonical)
- action = SEND_DRAFT / REPLY / etc
- canonical payload (stable ordering)

The exact function must be explicitly defined.

---

### 2. Persist Idempotency Key at Boundary

Extend outbound storage to include:

- `idempotency_key` (unique constraint)

Behavior:

- insert outbound_command with idempotency_key
- if key already exists:
  - do not create duplicate
  - return existing record

No duplicate side effect may be emitted beyond this point.

---

### 3. Align Tool Execution with Idempotency

If tools produce side effects (even in future phases):

- tool execution must either:
  - be idempotent by definition
  - or be guarded by same idempotency key

For Phase A/B:

- explicitly document that only read-only tools are allowed
- but still enforce structure for future write tools

---

### 4. Tie Execution Attempt to Idempotency

Ensure:

- execution_attempt → outbound_command mapping is:
  - many attempts → one outbound intent

On retry:

- repeated execution_attempt must converge on same idempotency_key
- must not generate new outbound_command

---

### 5. Update Recovery Semantics

Under crash:

- if outbound_command already exists:
  - recovery must not create new one
- if execution incomplete:
  - retry produces same idempotency key

---

### 6. Tests

Add integration tests:

A. retry after crash → single outbound_command  
B. duplicate runtime output → single outbound_command  
C. parallel attempts (if possible) → no duplication  
D. replay after restart → no additional side effects  
E. idempotency key collision only occurs for identical intent

---

## Invariants

1. Outbound side effects are idempotent at system boundary.
2. Multiple execution attempts must converge to one effect.
3. Idempotency is enforced by storage, not caller discipline.
4. No external side effect occurs without passing through idempotent boundary.
5. Identity + payload fully determine outbound uniqueness.

---

## Constraints

- do not redesign scheduler
- do not introduce distributed coordination
- do not depend on traces for idempotency
- do not introduce global ordering guarantees
- do not expand to external delivery systems yet

---

## Deliverables

- idempotency key definition
- schema update for outbound_commands
- insertion logic enforcing uniqueness
- integration tests covering retry/replay
- minimal documentation of boundary semantics

---

## Acceptance Criteria

- duplicate outbound effects are structurally impossible
- retries and crashes do not produce duplicate commands
- idempotency key is deterministic and stable
- tests validate behavior under failure scenarios
- all tests pass

---

## Definition of Done

Outbound side effects are:

- idempotent
- replay-safe
- invariant under retry and crash
- aligned with system identity model