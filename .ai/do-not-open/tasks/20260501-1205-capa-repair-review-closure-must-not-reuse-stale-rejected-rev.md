---
status: claimed
---

# CAPA: repair-review closure must not reuse stale rejected review identity

## Chapter

Architect Inbox Processing

## Goal

Repair task-governance review/finish semantics so accepted repair reviews and normal closure cannot be blocked or misreported by stale rejected Evidence Admission or reused rejected review identity.

## Context

<!-- Context placeholder -->

## Required Work

0. Source summary: Task lifecycle repair reviews after prior rejection exposed two confusing states in narada-andrey: task review accepted_with_notes did not close because stale rejected Evidence Admission still blocked closure, and task finish --close succeeded but reported review_action=reused with an older rejected review_id. This makes accepted repair reviews look semantically tied to the rejected review and can mislead architects while clearing backlog.
1. Read source inbox envelope env_704501c8-f660-4b22-bffc-6f532be37f38 and preserve its authority context.
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

- [ ] Reproduce the stale rejected review identity / stale Evidence Admission closure failure with a focused regression.
- [ ] Ensure an accepted repair review creates or reports the correct accepted review identity rather than reusing an older rejected review id.
- [ ] Ensure task finish --close and task close report closure state from current Evidence Admission, not stale rejected admission rows.
- [ ] Bound output so architect-facing machine and human output clearly distinguishes reused valid acceptance from stale rejected identity.
- [ ] Verify with focused task-governance/task-review/task-finish tests and a bounded CLI readback.
- [ ] Record CAPA evidence and close through governed task lifecycle.
