---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T01:25:29.669Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-30T01:25:30.845Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add governed deferred task unblock and resume path

## Chapter

Architect Inbox Processing

## Goal

Allow deferred tasks to re-enter the normal work/proof/finish path through a governed unblock or resume transition once the recorded unblock condition is satisfied.

## Context

<!-- Context placeholder -->

## Required Work

0. Source summary: In the narada-andrey User Site, task 13 was deferred while blocked by Windows LockApp foreground activation. After the external unblock condition was satisfied, implementation and verification proceeded and were committed, but task lifecycle authority remains deferred because task continue rejects deferred tasks and task reopen only accepts terminal tasks. This leaves completed work unable to re-enter the normal proof/finish/close path.
1. Read source inbox envelope env_ef1c37b9-ca9d-4268-b22c-933c2aedf80e and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Define and implement a sanctioned transition for deferred tasks, such as task unblock or task resume, that records who resumed it, why the blocker is satisfied, and what evidence supports resumption.
- [x] Ensure task continue/reopen/workboard semantics no longer strand deferred tasks that need to return to work after an external blocker clears.
- [x] Require bounded evidence or rationale for moving from deferred back to opened, claimed, or needs_continuation; do not make deferral silently auto-resume.
- [x] Add regression tests covering deferred task rejection today, successful governed unblock/resume, workboard visibility after resumption, and invalid resume without evidence/rationale.
- [x] Update task lifecycle docs/help so agents know the canonical path for deferred task resumption.
