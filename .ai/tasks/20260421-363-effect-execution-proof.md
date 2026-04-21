---
status: opened
depends_on: [362]
---

# Task 363 — Effect Execution Proof

## Context

Tasks 358–362 should create one bounded effect-execution path under explicit authority.

This task proves the whole path without claiming production readiness.

## Goal

Prove:

```text
operator approval
-> approved command
-> execution attempt
-> external adapter submit
-> submitted state
-> separate reconciliation observation
-> confirmed state
```

## Required Work

### 1. Build focused proof

Use `runCycle()` or a focused worker invocation plus reconciliation path, depending on what the chapter contract allows.

The proof must include operator approval if Task 355's control surface is available.

### 2. Assert boundaries

Assert:

- evaluator does not execute
- approval precedes execution
- adapter does not decide authority
- submitted does not equal confirmed
- confirmation requires observation
- audit/attempt records are inspectable

### 3. No-overclaim statement

Update docs or evidence to state:

- whether external Graph boundary is mocked or live
- whether actual email was sent
- whether production deployment was exercised

### 4. Tests

Use focused tests only.

## Non-Goals

- Do not claim production readiness.
- Do not implement more than one effect type unless already trivial and contract-approved.
- Do not hide mocked external boundaries.
- Do not create derivative task-status files.

## Acceptance Criteria

- [ ] Proof exists for approved command through reconciliation.
- [ ] IAS boundaries are asserted.
- [ ] Audit and attempt records are inspectable.
- [ ] External boundary is honestly classified as mocked/live/blocked.
- [ ] Focused verification passes.
- [ ] No derivative task-status files are created.
