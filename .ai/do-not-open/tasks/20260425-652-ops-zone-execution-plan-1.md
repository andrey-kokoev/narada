---
status: closed
depends_on: []
amended_by: a2
amended_at: 2026-04-25T13:54:09.722Z
closed_at: 2026-04-25T13:54:14.165Z
closed_by: a2
governed_by: task_close:a2
---

# Task 652 — Assignment Intent Zone Execution

## Goal

Task 652 — Assignment Intent Zone Execution

## Context

Assignment authority is currently split across recommend, roster assign, claim, continue, task-next, and ad hoc operator direction. This produces drift: the recommender can say one thing, roster another, lifecycle another, and session targeting yet another. Assignment Intent Zone should produce one durable assignment request and one durable assignment result for all assignment-like transitions.

## Required Work

1. Add an `assignment_intents` SQLite table or equivalent first-class store rows for request/result pairs.
2. Define `AssignmentIntentRequest` and `AssignmentIntentResult` types covering:
   - recommend-only / peek;
   - assign;
   - claim;
   - continue/takeover;
   - release/done if needed for closure symmetry.
3. Route `task roster assign`, `task claim`, and `task continue` through the same internal admission function.
4. Keep existing CLI shapes working, but have them emit/link the assignment result.
5. Ensure assignment result confirms lifecycle, roster, and assignment record agreement.
6. Add focused tests for:
   - claim updates assignment result and roster/lifecycle consistently;
   - roster assign and direct claim share the same admission checks;
   - blocked/dependency-unmet requests produce rejected results without partial mutation;
   - continuation/takeover records previous assignment and result.
7. Keep this task scoped to task-governance Assignment Intent Zone, not runtime scheduler leases.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Planning completed. This task is ready for implementation.
- Amended by a2 at 2026-04-25T13:54:09.722Z: checked all acceptance criteria

## Verification

Plan checked against current rough surfaces: roster/lifecycle drift, recommender output hygiene, claim-not-updating-roster history, and continuation/takeover ambiguity.

## Acceptance Criteria

- [x] Durable assignment request/result rows exist.
- [x] `task roster assign`, `task claim`, and `task continue` share one admission function.
- [x] Failed assignment intent leaves lifecycle, roster, and assignment records unchanged.
- [x] Successful assignment intent confirms lifecycle, roster, and assignment record agreement.
- [x] Focused tests cover direct claim, roster assign, blocked request, and continuation/takeover.
- [x] Existing CLI commands remain backwards-compatible.


