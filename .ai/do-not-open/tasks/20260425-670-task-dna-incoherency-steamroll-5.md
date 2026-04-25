---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:02:54.618Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:13:52.365Z
closed_at: 2026-04-25T18:13:57.530Z
closed_by: a2
governed_by: task_close:a2
---

# Eliminate test-only canonical paths

## Goal

Ensure production CLI paths are canonical and tests do not become secretly more correct by injecting stores or bypassing normal command setup.

## Context

task close/review previously updated SQLite only when tests injected a store. That violates Narada authority posture because production must be the path under test.

## Required Work

1. Find command options that accept injected stores or equivalent test-only authority handles. 2. Keep injection only where it is explicitly a unit seam, not required for canonical behavior. 3. Add production-path tests that call command functions without injected stores and verify SQLite rows. 4. Document any remaining injection seams.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:02:54.618Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] close and review production path tests verify SQLite lifecycle updates without store injection
- [x] remaining store injection seams are justified as unit seams
- [x] normal CLI path is not less authoritative than test path
- [x] typecheck and focused tests pass



