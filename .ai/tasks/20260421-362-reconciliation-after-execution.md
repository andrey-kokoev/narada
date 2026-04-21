---
status: opened
depends_on: [361]
---

# Task 362 — Reconciliation After Execution

## Context

Task 361 may submit an external effect attempt. Confirmation must remain separate. This task ensures submitted effects can only become confirmed through live reconciliation observations.

## Goal

Connect effect execution output to reconciliation without collapsing submission into confirmation.

## Required Work

### 1. Use execution external references

Reconciliation should use external references persisted by Task 361 where available:

- internetMessageId
- draft id
- outbound id header
- target message id

### 2. Preserve confirmation rule

Only reconciliation observations may transition submitted commands to confirmed.

Execution attempt success must not confirm.

### 3. Tests

Add focused tests proving:

- submitted command remains unconfirmed without observation
- matching live-style observation confirms
- failed/missing observation leaves command submitted or retry/residual state as designed
- execution attempt record alone cannot confirm

## Non-Goals

- Do not call live Graph unless already safely mocked through adapter boundary.
- Do not add new effect types.
- Do not create autonomous send.
- Do not create derivative task-status files.

## Acceptance Criteria

- [ ] Submitted and confirmed remain separate.
- [ ] Reconciliation uses external references where available.
- [ ] Execution attempt success cannot confirm.
- [ ] Focused tests cover matched and missing observations.
- [ ] No derivative task-status files are created.
