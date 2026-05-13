---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T00:35:52.624Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T00:35:53.066Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Repair task-governance roster fixture failures

## Chapter

Task Governance

## Goal

Repair the unrelated roster fixture failures observed while closing task 1086 so the focused task-governance test file can pass again.

## Context

Derived from residual recorded during task 1086 evidence repair: full packages/task-governance/test/lib/task-governance.test.ts had 7 roster mutation fixture failures unrelated to the pre-invariant dependency compatibility path. This task owns diagnosing and repairing those test fixture failures without changing unrelated doctrine review artifacts.

## Required Work

1. Reproduce the current task-governance roster fixture failures. 2. Identify whether the fault is test fixture setup or production roster mutation behavior. 3. Make the smallest code/test change that restores intended behavior. 4. Verify the full task-governance test file passes.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] The previously failing roster mutation tests pass.
- [x] Full packages/task-governance/test/lib/task-governance.test.ts passes with the same bounded invocation.
- [x] No unrelated package behavior or Site state is changed.
