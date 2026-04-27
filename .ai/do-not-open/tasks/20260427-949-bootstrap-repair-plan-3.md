---
status: closed
depends_on: []
closed_at: 2026-04-27T01:50:25.424Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 949 — Bootstrap Doctor Repair Plan — Task 3

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/doctor.ts`

## Context

Native SQLite binding failure was a concrete Windows trial friction.

## Goal

Populate structured repair command for `better-sqlite3` native binding failure.

## Required Work

1. Add `pnpm rebuild better-sqlite3` command string.
2. Add argv array.
3. Preserve existing remediation prose.

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

Added structured repair metadata to the `better-sqlite3-native` failure check.

## Verification

Typecheck and doctor tests passed.

## Acceptance Criteria

- [x] Native binding failure has rebuild command.
- [x] Native binding failure has argv array.
- [x] Native binding success emits no repair item.
