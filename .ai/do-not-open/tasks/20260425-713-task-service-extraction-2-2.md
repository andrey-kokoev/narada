---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T20:07:41.114Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T20:07:42.714Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 713 — Extract Task Search Service

## Goal

Move task search operation logic into @narada2/task-governance so task search uses package-owned projection rules.

## Context

Task search now prefers SQLite lifecycle/task_specs metadata, but the command still owns scan, match, and projection assembly logic.

## Required Work

1. Create a package-owned task search service that performs full-text compatibility search and returns bounded task search results.
2. Make the CLI command parse query/options, call the service, and render output.
3. Preserve SQLite metadata precedence for status and title.
4. Move or add service-level tests for SQLite-backed search metadata.

## Non-Goals

- Do not build a search index.
- Do not remove markdown full-text compatibility search in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Task search scan/match/projection logic is package-owned.
- [x] CLI task search is adapter-shaped.
- [x] Package-level tests prove SQLite status/title override markdown metadata.
- [x] CLI task search focused test still passes.


