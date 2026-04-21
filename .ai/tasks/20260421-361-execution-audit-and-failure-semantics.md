---
status: opened
depends_on: [359, 360]
---

# Task 361 — Execution Audit And Failure Semantics

## Context

Effect execution must be auditable because it mutates the outside world. Failed execution must not disappear into logs or be treated as confirmation.

## Goal

Persist execution attempts, external references, failures, and retry/terminal state honestly.

## Required Work

### 1. Integrate worker and adapter

Wire the worker state machine from Task 359 to the adapter from Task 360.

The worker owns state transitions. The adapter owns external mutation attempt only.

### 2. Persist attempt outcomes

For each attempt, persist:

- started/finished timestamps
- adapter result
- external identity references
- submitted/retry/terminal classification
- error detail when present

### 3. Idempotency and ambiguity handling

Define behavior for:

- worker crash after external mutation but before persistence
- duplicate execution attempts
- missing external id
- retry after ambiguous submit

If ambiguity cannot be resolved in this chapter, record it explicitly as residual and fail closed.

### 4. Tests

Add focused tests proving:

- successful adapter result records submitted but not confirmed
- retryable failure records retry state
- terminal failure records terminal state
- ambiguous post-effect failure does not blindly retry without residual/guard

## Non-Goals

- Do not implement live reconciliation.
- Do not execute autonomous send without approval.
- Do not hide ambiguous effects.
- Do not create derivative task-status files.

## Acceptance Criteria

- [ ] Worker and adapter are integrated under authority contract.
- [ ] Attempts are auditable.
- [ ] Success records submitted, not confirmed.
- [ ] Failures are classified honestly.
- [ ] Ambiguity is fail-closed or explicitly residualized.
- [ ] Focused tests cover success, retryable, terminal, and ambiguous cases.
- [ ] No derivative task-status files are created.
