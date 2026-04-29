---
status: claimed
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

- [ ] TaskStatus and lifecycle SQLite authority admit deferred as a persisted status.
- [ ] There is a sanctioned CLI transition into deferred with required rationale/residual/unblock evidence.
- [ ] Deferred tasks do not appear as runnable recommendations or active builder work, but remain visible as deferred/blocker posture.
- [ ] Dependencies on deferred tasks explain the blocker and unblock condition instead of generic unmet dependency only.
- [ ] Existing use of in_review is not abused for external deferral.
- [ ] Task 403 can be migrated from in_review workaround to deferred without direct file or SQLite edits.
