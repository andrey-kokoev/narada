---
status: opened
---

# Formalize TaskClosurePosture state machine

## Chapter

state-machine-formalization

## Goal

Make task review and closure use an explicit closure-posture state machine instead of scattered completion special cases.

## Context

Operator requested proceeding with all identified state-machine opportunities. This task is the highest-value pullback over tasks 1169, 1172, 1174, 1176, and related 1173 ergonomics.

## Required Work

Define TaskClosurePosture states and transitions; integrate posture into task evidence, review, close, and report surfaces; reconcile existing partial-completion CAPA tasks so implementation follows this model rather than one-off patches; add tests and docs.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] States include capability_complete, scope_complete_with_continuation, scope_complete_with_deferral, repair_required, and blocked, or documented equivalents.
- [ ] Review and close commands require or infer closure posture before done wording.
- [ ] Residual crossings are explicit before a task can be treated as capability complete.
- [ ] Existing tasks 1169, 1172, 1174, 1176 are mapped to this model.
- [ ] Tests cover each closure posture and invalid transitions.
