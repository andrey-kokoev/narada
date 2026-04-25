---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:03:15.056Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:10:07.836Z
closed_at: 2026-04-25T18:10:12.682Z
closed_by: a2
governed_by: task_close:a2
---

# Tighten roster locality and assignment coupling

## Goal

Reduce roster as a broad mutable projection by requiring roster views and reconciliation to stay local to requested task/agent scope.

## Context

A bounded reconcile over 656-665 initially surfaced stale task 634 roster drift because roster checks ignored the requested range.

## Required Work

1. Audit roster show/done/assign/reconcile surfaces for unscoped reads and broad JSON payloads. 2. Ensure range or agent filters are honored consistently. 3. Ensure assignment/lifecycle authority, not stale roster projection, determines active work. 4. Add focused tests for out-of-scope roster entries being ignored in scoped operations.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:03:15.056Z: title, goal, context, required work, acceptance criteria, dependencies

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] scoped reconciliation ignores out-of-range roster drift
- [x] roster command JSON mutation outputs stay bounded
- [x] active task ownership derives from assignment/lifecycle rows
- [x] tests cover out-of-scope roster behavior



