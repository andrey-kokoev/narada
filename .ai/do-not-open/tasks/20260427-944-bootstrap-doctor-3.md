---
status: closed
depends_on: []
closed_at: 2026-04-27T01:42:54.552Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 944 — Bootstrap Doctor Ergonomic Readiness — Task 3

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/doctor.ts`
- `docs/deployment/windows-site-boundary-contract.md`

## Context

The Windows Site trial hit missing `better-sqlite3` native binding. That should be a named readiness check, not an ad hoc copy workaround.

## Goal

Check native SQLite readiness.

## Required Work

1. Resolve `better-sqlite3` from repository root.
2. Open and close an in-memory database.
3. Return remediation when native load fails.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

Used `createRequire(join(root, 'package.json'))` to load `better-sqlite3` from the checkout and probe `:memory:`.

## Verification

Live bootstrap doctor reports `better-sqlite3-native` pass.

## Acceptance Criteria

- [x] Native binding is actually loaded.
- [x] Probe closes the database.
- [x] Failure remediation names rebuild/reinstall path.
