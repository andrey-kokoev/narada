---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T21:53:36.323Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T21:53:37.928Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 722 — Backstop Review Verdict Semantics With Focused Tests

## Goal

Add tests that pin canonical review verdict storage and legacy read compatibility so the alias split cannot reappear.

## Context

Focused CLI tests caught the injected-store path. The legacy helper path still needs explicit coverage because it remains callable by compatibility code.

## Required Work

1. Add or adjust focused tests for saveReview/loadReview canonicalization.
2. Add or adjust command/service tests for rejected verdict persistence through injected store.
3. Include a legacy needs_changes fixture row and assert normalized reads treat it as rejected.
4. Keep tests scoped to task-governance and CLI review surfaces.

## Non-Goals

- Do not broaden to all task lifecycle tests unless needed.
- Do not rewrite unrelated task evidence tests.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A test fails if saveReview stores needs_changes for a rejected review.
- [x] A test fails if a legacy needs_changes row no longer normalizes to rejected.
- [x] Existing task-review command tests continue to pass.
- [x] Focused verification commands and results are recorded in execution notes.
