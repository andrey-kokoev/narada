---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:20:36.215Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:37:39.822Z
closed_at: 2026-04-25T18:37:44.489Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Centralize task projection compatibility writes

## Goal

Legacy markdown task projection writes should be one explicit projection mechanism, not scattered authority-looking writes across lifecycle commands.

## Context

Task command migration still leaves many commands writing front matter or report-looking content for compatibility. Scattered projection writes obscure the real authority boundary.

## Required Work

Inventory remaining task projection writes; route them through task-projection helpers where possible; label projection writes as compatibility outputs; add tests that authority comes from SQLite rows, not projection writes.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:20:36.215Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Remaining projection writes have one named owner surface
- [x] Commands no longer hand-roll frontmatter projection where a helper exists
- [x] Tests verify lifecycle authority survives projection mismatch where relevant
- [x] Any residual direct write is listed with rationale



