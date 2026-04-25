---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T20:18:08.492Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T20:18:10.490Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 716 — Extract Task Continue Service

## Goal

Move task continue semantics out of the CLI command into @narada2/task-governance while keeping CLI output as adapter-only.

## Context

Continuation is part of the assignment lifecycle family. It must share package-owned authority with claim/release so continuation affinity and lifecycle transition rules do not remain split across CLI surfaces.

## Required Work

1. Inspect task-continue.ts and identify lifecycle, assignment, affinity, roster, and packet semantics currently command-owned.
2. Create or extend the assignment lifecycle package service so continue uses the same authority seam as claim.
3. Refactor task-continue.ts to parse options, call the package service, format bounded output, and return the service exit code.
4. Add package-level tests for continuation from needs_continuation, rejection from invalid lifecycle state, previous-agent preservation, and roster update behavior.
5. Run focused package and CLI continuation tests.

## Non-Goals

- Do not change continuation lifecycle names.
- Do not implement new autoassignment policy.
- Do not extract release in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Continue semantics are package-owned and not CLI-owned.
- [x] task-continue.ts is a thin adapter over the package service.
- [x] Continuation tests prove valid transition and invalid-state rejection.
- [x] Roster/lifecycle projection behavior remains compatible with existing command behavior.
- [x] Focused verification is recorded.


