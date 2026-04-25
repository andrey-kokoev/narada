---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T19:00:07.662Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T19:00:12.638Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 698 — Require explicit criteria proof verification posture

## Goal

Criteria proof must require either a verification run binding or an explicit no-run rationale.

## Context

task evidence prove-criteria currently defaults to an unbound rationale when no verification is supplied.

## Required Work

1. Make taskEvidenceProveCriteriaCommand reject missing verification posture.
2. Keep task finish orchestration explicit by passing its own no-run rationale.
3. Update tests for bound and unbound proof behavior.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] prove-criteria fails without --verification-run or --no-run-rationale.
- [x] prove-criteria succeeds with --verification-run.
- [x] task finish --prove-criteria still succeeds by passing explicit rationale.


