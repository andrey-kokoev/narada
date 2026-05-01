---
status: opened
---

# Unify partial completion handling under typed closure posture

## Chapter

task-lifecycle-pullback

## Goal

Replace scattered facade, prototype, evidence-repair, forward-momentum, and CAPA-trigger special cases with one typed closure posture model.

## Context

Operator pullback env_ccb098c5-1790-4122-aaca-8712d1856e2c identifies a simplification opportunity: tasks 1169, 1172, 1174, and part of 1173 are symptoms of one lifecycle need. Partial completion must expose its residual crossing before it can be treated as done.

## Required Work

Define typed closure postures for task review and close; map current CAPA tasks 1169, 1172, 1174, and relevant 1173 ergonomics onto the model; update review/close/evidence semantics to require closure posture before done wording; ensure existing tasks can be implemented as instances of the model instead of one-off patches; add tests and docs.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Closure posture vocabulary includes capability_complete, scope_complete_with_continuation, scope_complete_with_deferral, repair_required, and blocked, or documented equivalents.
- [ ] Review and close outputs distinguish capability completion from scope completion with residual crossings.
- [ ] Evidence repair after accepted review is represented as repair_required rather than a lifecycle dead-end special case.
- [ ] Facade/prototype/spike completion is represented as scope_complete_with_continuation or scope_complete_with_deferral rather than ad hoc warnings.
- [ ] Forward-momentum requirements are expressed as residual crossing handling under closure posture.
- [ ] Tasks 1169, 1172, 1174, and relevant 1173 work are explicitly referenced or reconciled so Builder does not implement contradictory one-off mechanisms.
- [ ] Focused tests cover each closure posture and prevent done wording when residual crossing is unhandled.
