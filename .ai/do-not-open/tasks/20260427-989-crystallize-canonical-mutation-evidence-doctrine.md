---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T21:34:08.463Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T21:34:08.903Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Crystallize canonical mutation evidence doctrine

## Chapter

sqlite-git-authority

## Goal

Make the SQLite-in-Git resolution explicit: SQLite is local runtime substrate, Git carries canonical mergeable mutation evidence, and reconciliation must replay admitted operations rather than merge opaque SQLite files.

## Context

Inbox envelope `env_d8603149-9dd8-4210-94a6-1bec77aca92c` captured the preferred direction for SQLite-backed state in Git-backed Narada Sites. The doctrine to admit is not "merge SQLite better"; it is "emit canonical mutation evidence and replay/reconcile local SQLite from admitted operations."

## Required Work

1. Add Narada-local doctrine for Canonical Mutation Evidence.
2. Link it from agent and semantic guidance.
3. Keep the current snapshot/export surfaces classified as transitional or partial rather than pretending the final append-only mutation log exists.
4. Archive or otherwise govern the source inbox envelope.
5. Verify the repo after the doctrine update.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Narada docs define canonical mutation evidence and its relationship to SQLite
- [x] Git
- [x] snapshots
- [x] exports
- [x] and replay.
- [x] Core guidance links the doctrine where agents and semantic readers will see it.
- [x] The source inbox envelope is handled through a governed archive or pending action.
- [x] pnpm verify passes.
