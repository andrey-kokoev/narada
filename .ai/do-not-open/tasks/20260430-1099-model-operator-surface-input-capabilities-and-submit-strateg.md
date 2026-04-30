---
status: claimed
---

# Model Operator Surface input capabilities and submit strategies

## Chapter

Architect Inbox Processing

## Goal

Model operator-surface input as explicit focus/type/submit capabilities with safe submit strategy posture, so agents and UI adapters stop probing live surfaces with arbitrary keyboard chords.

## Context

<!-- Context placeholder -->

## Required Work

0. Source summary: A live attempt to send next into a bound builder operator surface showed that identity-targeted focus and text delivery can work, but submit semantics are not portable. Enter, Ctrl+Enter, and Shift+Enter inserted newlines; Alt+Enter triggered Windows Terminal fullscreen/focus behavior. Narada operator-surface input machinery should model type and submit as separate capabilities rather than assuming generic keyboard chords.
1. Read source inbox envelope env_ef0d44be-4abd-4103-b00c-9acc37a5e486 and preserve its authority context.
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

- [ ] Define Operator Surface input capability taxonomy covering at least focus, type_text, submit, clear_pending_input, and recover_surface_state.
- [ ] Represent submit_strategy per surface with safe postures such as type_only, operator_confirmed_submit, and known_surface_submit.
- [ ] Default automation must be type_only unless surface-specific evidence admits a submit strategy.
- [ ] Add guardrails preventing repeated blind submit-chord probing against live agent surfaces.
- [ ] Update relevant Operator Surface documentation and focused tests for the new posture.
