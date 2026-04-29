---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T23:23:58.955Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented first-class deferred task status in shared lifecycle vocabulary and state transitions; added sanctioned narada task defer command with required reason/unblock/residual evidence; deferred tasks are excluded from runnable recommendations and active work while shown on workboard/lifecycle posture; dependency diagnostics now distinguish deferred blockers; task 403 was migrated from in_review workaround to deferred via the new command.
closed_at: 2026-04-29T23:24:36.057Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add first-class deferred task lifecycle status

## Chapter

Canonical Inbox Promotions

## Goal

Promoted from inbox envelope env_b83e6fcd-b19f-46dc-a6c1-bd09b410bf78.

## Context

Source inbox envelope: env_b83e6fcd-b19f-46dc-a6c1-bd09b410bf78

Source: user_chat:operator:proposal-to-architect:add-deferred-task-status

Envelope kind: upstream_task_candidate

## Required Work

1. Read source inbox envelope env_b83e6fcd-b19f-46dc-a6c1-bd09b410bf78 and preserve its authority context.
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

- [x] TaskStatus and lifecycle SQLite authority admit deferred as a persisted status.
- [x] There is a sanctioned CLI transition into deferred with required rationale/residual/unblock evidence.
- [x] Deferred tasks do not appear as runnable recommendations or active builder work, but remain visible as deferred/blocker posture.
- [x] Dependencies on deferred tasks explain the blocker and unblock condition instead of generic unmet dependency only.
- [x] Existing use of in_review is not abused for external deferral.
- [x] Task 403 can be migrated from in_review workaround to deferred without direct file or SQLite edits.
