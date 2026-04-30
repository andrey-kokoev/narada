---
status: opened
---

# Add completion-claim reconciliation duty and command

## Goal

Make informal Builder completion claims trigger a governed reconciliation against task lifecycle, evidence, tests, and git state before Architect treats them as review-ready.

## Context

Source inbox envelope env_75d1eabe-e310-46c2-8059-f75fee63d2fd reports a User Site incident where Builder believed task 58 was finished, but durable state still showed claimed, unchecked criteria, no report, uncommitted files, and a failing test.

## Required Work

1. Document the invariant: agent completion claim to Architect reconciliation to review if ready, or return-to-builder with exact blocking evidence. 2. Add or specify a compact reconcile-claim command for a task or agent that reports lifecycle status, report presence, checked criteria, verification evidence, dirty file posture, latest commits, and recommended action. 3. Update Architect duty-loop guidance so any Builder done or completed claim is treated as an observation requiring reconciliation, not lifecycle truth. 4. Update Builder role-loop guidance so Builder finishes through task report, finish, or close surfaces, not chat claims. 5. Ensure output is bounded and suitable for operator-surface and chat use. 6. Add focused regression coverage or fixtures for claimed task plus informal completion claim plus dirty or failing or unreported state returning return-to-builder guidance.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Architect docs or guidance state that chat and operator-surface completion claims are observations, not lifecycle authority.
- [ ] A compact reconcile-claim command or specified equivalent reports lifecycle, criteria, report, verification, dirty files, and recommended action.
- [ ] Builder guidance requires durable task report, finish, or close path for completion.
- [ ] Reconciliation output can return review-ready or return-to-builder with exact blockers.
- [ ] Tests or fixtures cover the incident shape where Builder says done but task is still claimed with missing evidence.
