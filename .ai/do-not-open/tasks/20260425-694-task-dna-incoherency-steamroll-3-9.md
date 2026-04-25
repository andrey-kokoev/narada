---
status: closed
depends_on: []
amended_by: architect
amended_at: 2026-04-25T18:40:55.094Z
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T18:47:54.693Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T18:47:56.068Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Move tests away from markdown state setup where commands own state

## Goal

Tests should construct lifecycle states through commands or SQLite builders, not by hand-writing markdown frontmatter as authority.

## Context

Many tests still seed task status by writing markdown, fossilizing old authority assumptions.

## Required Work

Add or use test helpers for lifecycle rows and command-created task states; migrate focused tests touched by this chapter; document residual legacy fixtures.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-25T18:40:55.094Z: title, goal, context, required work, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] New tests in this chapter do not rely on markdown-only lifecycle authority
- [x] At least one fossilized fixture is migrated
- [x] Residual markdown fixture use is bounded
- [x] Focused tests pass


