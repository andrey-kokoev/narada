---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T20:05:28.142Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T20:05:29.476Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 712 — Extract Task Allocation Service

## Goal

Move task number allocation operation logic from the CLI command into @narada2/task-governance so CLI allocate is an adapter.

## Context

Task allocation is already mostly domain-owned through task-governance helpers, but the command still owns count validation, dry-run behavior, and output-shaped operation results.

## Required Work

1. Create a package-owned task allocation service with count and dry-run support.
2. Change the CLI task allocate command to call the package service and only render output.
3. Keep the existing --count and --dry-run behavior stable.
4. Add or move focused tests so service behavior is covered at package level while the CLI adapter remains covered.

## Non-Goals

- Do not change allocated number identity rules.
- Do not alter chapter init numbering behavior.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Allocation count validation is package-owned.
- [x] CLI task allocate no longer owns allocation operation semantics.
- [x] Package-level tests cover single allocation, range allocation, dry-run range preview, and invalid count.
- [x] Existing task allocate command tests pass.


