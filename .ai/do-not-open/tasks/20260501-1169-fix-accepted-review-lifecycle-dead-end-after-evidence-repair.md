---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T03:13:43.360Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777605189590_sq1i0d
closed_at: 2026-05-01T03:14:35.788Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Fix accepted review lifecycle dead-end after evidence repair

## Chapter

task-lifecycle-capa

## Goal

Prevent tasks from getting stuck in in_review when implementation review is accepted but evidence admission still requires repair.

## Context

Inbox incident env_a44641fa-a8a7-4686-9bd3-cb48c630f8e9 reports task 62 reached an uncloseable state: review accepted_with_notes left lifecycle in_review while latest evidence admission remained rejected, and task continue refused because only claimed or needs_continuation can continue.

## Required Work

Define and implement the sanctioned lifecycle path for rejected evidence followed by accepted implementation review with remaining evidence repair; expose exact repair commands when close fails; add tests for rejected to fixed to accepted_with_notes to close, and rejected to fixed to evidence-repair-needed continuation.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Accepted implementation review cannot leave a task in an in_review dead-end when evidence admission still requires repair.
- [x] task close reports an exact sanctioned continuation or repair command when latest evidence admission blocks closure.
- [x] task continue or an equivalent sanctioned command supports the evidence-repair-needed state without requiring artificial rejection.
- [x] Tests cover rejected evidence followed by fixed implementation and accepted_with_notes review.
- [x] Tests cover evidence repair required after implementation acceptance and successful eventual closure.
- [x] Documentation or command help names the lifecycle state and allowed transitions.
