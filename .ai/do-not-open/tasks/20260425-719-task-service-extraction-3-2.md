---
status: closed
depends_on: []
criteria_proved_by: a1
criteria_proved_at: 2026-04-25T22:02:05.301Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T22:02:08.616Z
closed_by: a1
governed_by: task_close:a1
closure_mode: agent_finish
---

# Task 719 — Extract Review Admission Service

## Goal

Move task review operator semantics from the CLI command into @narada2/task-governance so verdict handling, findings validation, evidence admission, and closure orchestration are package-owned.

## Context

<!-- Context placeholder -->

## Required Work

1. Create a review service module in packages/task-governance/src
2. Port task review status transitions, validation, linked report checks, and evidence admission gating
3. Call governed close service for accepted reviews when evidence is sufficient
4. Update task-review CLI command to delegate to package service

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task-review command delegates to review service
- [x] accepted and rejected verdict transitions match existing behavior
- [x] evidence gating still enforced for accepted verdicts
- [x] linked report status updates remain correct
