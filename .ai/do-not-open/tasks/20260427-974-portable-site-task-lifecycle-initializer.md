---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T20:00:03.726Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T20:00:04.209Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Portable Site task lifecycle initializer

## Chapter

Site-local task lifecycle ergonomics

## Goal

Provide a sanctioned Narada CLI surface to initialize SQLite-backed task lifecycle machinery inside an arbitrary Site path without requiring Narada monorepo-local imports, task directories, or workspace package graph assumptions.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Add a Site-local task lifecycle init command that accepts an explicit Site path and initializes the lifecycle database/schema there.
- [x] Do not require the target Site to be the Narada proper repo or to contain .ai/do-not-open/tasks.
- [x] Use existing task lifecycle schema initialization code rather than duplicating a divergent schema.
- [x] Return bounded JSON/human output with site path
- [x] database path
- [x] tables initialized
- [x] and whether the DB was created or already existed.
- [x] Add focused tests covering a temp external Site path
- [x] idempotent re-run
- [x] and no mutation of Narada proper task state.
- [x] Document the command in the Site/task lifecycle docs or relevant product concept.
- [x] Handle source inbox envelope env_e50511ac-f65e-4f59-ac84-98bbe27107f6.
