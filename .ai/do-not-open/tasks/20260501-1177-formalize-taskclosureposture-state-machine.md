---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T03:58:41.781Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777607885160_2y71i1
no_continuation_needed_rationale: TaskClosurePosture state-machine formalization is complete in code, evidence projection, docs, and tests; sibling state-machine tasks handle adjacent models separately.
closed_at: 2026-05-01T03:59:14.344Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
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

- [x] States include capability_complete, scope_complete_with_continuation, scope_complete_with_deferral, repair_required, and blocked, or documented equivalents.
- [x] Review and close commands require or infer closure posture before done wording.
- [x] Residual crossings are explicit before a task can be treated as capability complete.
- [x] Existing tasks 1169, 1172, 1174, 1176 are mapped to this model.
- [x] Tests cover each closure posture and invalid transitions.
