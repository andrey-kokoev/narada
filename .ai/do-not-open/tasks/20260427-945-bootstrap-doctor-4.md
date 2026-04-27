---
status: closed
depends_on: []
closed_at: 2026-04-27T01:42:55.932Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 945 — Bootstrap Doctor Ergonomic Readiness — Task 4

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/inspection-admin-register.ts`

## Context

The readiness surface must be discoverable from the existing doctor command family.

## Goal

Expose bootstrap doctor through CLI.

## Required Work

1. Add `--bootstrap`.
2. Add `--cwd`.
3. Wire options to `doctorCommand`.

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

Registered `--bootstrap` and `--cwd` on `narada doctor`.

## Verification

CLI build passed and live `pnpm narada doctor --bootstrap --format json` worked.

## Acceptance Criteria

- [x] `narada doctor --bootstrap` is registered.
- [x] `narada doctor --bootstrap --cwd <path>` is registered.
- [x] Command emits finite output.
