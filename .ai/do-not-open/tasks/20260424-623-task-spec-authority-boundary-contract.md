---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T22:00:00.000Z
closed_by: codex
governed_by: task_close:codex
depends_on: []
artifact: .ai/decisions/20260424-623-task-spec-authority-boundary-contract.md
---

# Task 623 - Task Spec Authority Boundary Contract

## Execution Mode

Proceed directly. This is a dearbitrization task; fix the authority boundary before implementation.

## Context

The remaining task substrate still treats markdown as authored task spec. That leaves one final dual-surface authority split: SQLite owns task state, but markdown still owns task content. If task interaction is to be fully command-mediated, spec authority must also move behind sanctioned operators.

## Required Work

1. Define the final authority split for task specification fields.
2. Decide which task fields become SQLite-owned source of truth.
3. Decide what, if anything, remains in markdown outside projection/export.
4. State the invariant that no task field is independently authoritative in both stores.
5. State the sanctioned operator family required to keep task authoring usable after the cutover.

## Non-Goals

- Do not implement the cutover in this task.
- Do not leave markdown as implicit fallback authority.
- Do not preserve hidden dual authority for convenience.

## Execution Notes

Produced the authoritative boundary artifact:

- `.ai/decisions/20260424-623-task-spec-authority-boundary-contract.md`

Settled the final split:

- SQLite owns normal-path task specification
- SQLite owns lifecycle/runtime state
- markdown task files are projection/export only

Named the SQLite-owned spec fields explicitly:

- identity
- number
- title
- goal
- context
- required work
- non-goals
- acceptance criteria
- dependencies
- chapter linkage

Named the required sanctioned command family:

- `task create`
- `task read`
- `task amend`
- task observation/lifecycle/assignment/dispatch surfaces

Stated the non-dual-authority invariant and classified direct markdown/SQL access as maintenance-only.

## Verification

- decision artifact exists and is explicit about the final authority split
- SQLite-owned spec fields are named
- markdown posture is single-valued: projection/export only
- no-dual-authority invariant is stated
- required sanctioned command surfaces are named

## Acceptance Criteria

- [x] Final spec authority split is explicit.
- [x] SQLite-owned task spec fields are named.
- [x] Markdown posture after cutover is explicit.
- [x] No-dual-authority invariant is stated.
- [x] Required sanctioned command surfaces are named.
