# Phase B — Crash & Replay Determinism

## Context

Phase A established a real mailbox-agent execution loop:
sync → work item → lease → real charter runtime → tool execution → outbound command

Phase A hardening removed:
- runtime ambiguity
- unbounded tool execution
- normalization drift risk

The system is now *real*, but not yet *safe under failure*.

This task establishes deterministic behavior under crash and replay.

---

## Goal

Prove that:

> Any crash during daemon dispatch results in either:
> - correct continuation, or
> - safe supersession,
> with no duplicate or conflicting outbound side effects.

---

## Scope

Focus only on:

- daemon dispatch loop
- scheduler lease + execution_attempt lifecycle
- tool execution side effects
- outbound command creation

Do NOT:
- introduce arbitration changes
- expand tool system
- touch multi-mailbox
- redesign schema

---

## Required Work

### 1. Crash Injection Test Harness

Add integration tests that simulate daemon crashes at critical points:

Cases:

A. Crash after lease acquisition, before runtime invocation  
B. Crash during charter runtime execution  
C. Crash after evaluation, before tool execution  
D. Crash during tool execution  
E. Crash after tool execution, before outbound_command creation  
F. Crash after outbound_command creation, before work_item resolution  

Each test must:

- restart daemon
- verify final state is correct and deterministic

---

### 2. Define Correct Replay Behavior

For each crash point, explicitly assert:

- whether execution_attempt is:
  - resumed
  - abandoned
  - superseded

- whether work_item:
  - remains active
  - is retried
  - is replaced

- whether outbound_command:
  - is created exactly once
  - is not duplicated

---

### 3. Enforce Idempotency at Side-Effect Boundaries

Ensure:

- tool execution is idempotent or guarded
- outbound_command creation is idempotent

If necessary:
- introduce idempotency keys derived from:
  - execution_id
  - work_item_id

---

### 4. Validate Lease Recovery Semantics

Verify:

- stale leases correctly release work
- no double execution occurs after recovery
- retry_count and next_retry_at behave consistently

---

## Acceptance Criteria

- All crash scenarios produce deterministic final state
- No duplicate outbound_command rows are created
- No tool is executed more than once for the same execution attempt (unless explicitly retried with new attempt)
- Restarting daemon always converges to correct state
- All tests pass

---

## Output

- integration test suite:
  exchange-fs-sync-daemon/test/integration/crash-replay.test.ts

- any required minimal fixes to:
  - scheduler
  - coordinator store
  - daemon dispatch

---

## Definition of Done

System behavior under crash is:
- deterministic
- idempotent
- free of duplicate side effects