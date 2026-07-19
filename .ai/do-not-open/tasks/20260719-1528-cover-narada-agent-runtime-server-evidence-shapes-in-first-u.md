---
status: opened
---

# Cover narada-agent-runtime-server evidence shapes in first-use verification

## Goal

Extend onboarding first-use verification so the runtime-server carrier event vocabulary proves identity hydration and operator input admission.

## Context

<!-- Context placeholder -->

## Required Work

1. Accept session_started plus ready lifecycle transition as identity hydration proof. 2. Accept input_event_started as operator admission evidence alongside input_admitted_to_turn. 3. Add a runtime-shaped events.jsonl fixture test. 4. Update first-time-operator-success-path.md evidence wording.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] onboarding status verifies a runtime-server-shaped session as first_use_verified in the focused suite
- [ ] existing carrier fixture verification keeps passing
- [ ] tsc typecheck passes
