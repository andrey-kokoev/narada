---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T20:00:04.310Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T20:00:06.163Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 711 — Advance Task Spec Cutover Away From Markdown Authority

## Goal

Continue the migration from markdown-shaped task authority to sanctioned command and SQLite-backed task spec authority.

## Context

Task lifecycle and evidence authority have moved substantially into SQLite, but task specification still relies heavily on markdown projection under .ai/do-not-open/tasks. That remains the largest visible incoherence.

## Required Work

1. Inventory remaining code paths that read task spec fields directly from markdown instead of task_specs projection or sanctioned command surfaces.
2. Pick the next high-impact read path and route it through task-governance package authority.
3. Ensure direct markdown reads are treated as compatibility projection, not primary task authority.
4. Add or update tests showing the SQLite task spec row wins where authority has been migrated.

## Non-Goals

- Do not delete markdown task artifacts in this task.
- Do not break current task evidence/reconcile commands.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] There is a current inventory of remaining markdown-spec authority reads.
- [x] At least one concrete read path is migrated to task_specs or package-owned projection authority.
- [x] Tests cover the migrated path.
- [x] No direct operator task editing path is introduced.


