---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T20:14:14.384Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T20:14:16.536Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 715 — Extract Task Claim Service

## Goal

Move task claim semantics out of the CLI command into @narada2/task-governance while preserving current command behavior as an adapter.

## Context

Task service extraction rails identify assignment lifecycle as the next high-risk seam. Claim currently owns lifecycle, assignment, roster, and dispatch side effects through CLI-local orchestration.

## Required Work

1. Inspect task-claim.ts and identify command-owned semantics versus formatting/argument parsing.
2. Create a package-level claim service that owns validation, assignment intent recording, lifecycle transition, roster projection, and dispatch packet behavior currently owned by the CLI command.
3. Export the service through @narada2/task-governance package exports and index.
4. Refactor task-claim.ts so it parses options, calls the package service, formats bounded output, and returns the service exit code.
5. Add package-level service tests covering successful claim, already-claimed rejection, roster update, and SQLite lifecycle authority.
6. Keep or adjust CLI adapter tests so they verify adapter behavior rather than duplicated domain semantics.

## Non-Goals

- Do not redesign assignment intent schema.
- Do not change user-facing task claim CLI syntax except where unavoidable for adapter correctness.
- Do not extract continue or release in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Claim lifecycle semantics are implemented in @narada2/task-governance, not in task-claim.ts.
- [x] task-claim.ts is a thin adapter over the package service.
- [x] The package export map exposes the claim service.
- [x] Focused package service tests pass.
- [x] Focused CLI claim adapter tests pass or the existing focused claim coverage is run and documented.
- [x] No direct task file editing is used outside sanctioned command/service paths.


