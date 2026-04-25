---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:03:26.254Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:14:32.909Z
closed_at: 2026-04-25T18:14:37.589Z
closed_by: a2
governed_by: task_close:a2
---

# Enforce do-not-open task artifact boundary

## Goal

Make direct task artifact reading/editing a detectable violation and steer users/agents to sanctioned task commands.

## Context

Moving tasks to .ai/do-not-open/tasks is only a naming warning. Narada wants command-mediated task access to be the admissible path.

## Required Work

1. Add repository-local documentation or guard metadata at .ai/do-not-open explaining sanctioned access. 2. Add lint/reconcile detection for legacy/direct task artifact side effects where practical. 3. Ensure CLI help offers command alternatives for read/create/amend/evidence/close flows. 4. Document remaining substrate limits that cannot be enforced inside a normal filesystem checkout.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:03:26.254Z: title, goal, context, required work, acceptance criteria, dependencies

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] do-not-open boundary has explicit local contract
- [x] task command help provides sanctioned alternatives
- [x] direct file authority limitations are documented without pretending impossible enforcement
- [x] lint or reconcile has at least one detectable direct-access violation class or documented follow-up



