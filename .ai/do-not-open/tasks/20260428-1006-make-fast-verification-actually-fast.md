---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T01:02:41.488Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-28T01:02:41.996Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Make fast verification actually fast

## Chapter

Verification Posture

## Goal

Remove expensive assignment-lifecycle integration tests from the default pnpm verify path while preserving an explicit package-scoped command for deeper task-governance lifecycle coverage.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] pnpm verify no longer runs the slow task-assignment-lifecycle-service test file by default.
- [x] A named package script still runs assignment-lifecycle coverage explicitly.
- [x] Documentation states the difference between fast verification and deep task-governance lifecycle tests.
- [x] pnpm verify passes.
